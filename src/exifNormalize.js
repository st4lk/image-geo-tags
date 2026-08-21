/**
 * Fix the EXIF block produced by piexifjs.
 *
 * `piexif.dump()` writes a layout that violates the TIFF/Exif rules:
 *
 * 1. Sub-IFDs (ExifIFD, GPS, Interop) are not terminated by the mandatory
 *    4 byte "offset of the next IFD" field. The first value bytes take that
 *    place, so a strict reader takes them as the next IFD offset and treats
 *    the whole IFD as broken. That is why Strava (and other strict readers)
 *    ignored the GPS tags written by this tool, while exiftool - which
 *    recovers from the error - showed them just fine.
 * 2. Values may start at an odd offset, while TIFF expects them to be word
 *    aligned.
 *
 * normalizeExifBytes() rebuilds the block with a correct layout. Value bytes
 * are copied as is, only the offsets are recalculated.
 */

const EXIF_PREFIX = "Exif\x00\x00";

const EXIF_IFD_POINTER = 0x8769;
const GPS_IFD_POINTER = 0x8825;
const INTEROP_IFD_POINTER = 0xa005;
const THUMBNAIL_OFFSET = 0x0201;
const THUMBNAIL_LENGTH = 0x0202;

const TYPE_SIZES = {
  1: 1,   // BYTE
  2: 1,   // ASCII
  3: 2,   // SHORT
  4: 4,   // LONG
  5: 8,   // RATIONAL
  6: 1,   // SBYTE
  7: 1,   // UNDEFINED
  8: 2,   // SSHORT
  9: 4,   // SLONG
  10: 8,  // SRATIONAL
  11: 4,  // FLOAT
  12: 8,  // DOUBLE
};

const binaryStringToBytes = (str) => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
};

const bytesToBinaryString = (bytes) => {
  let str = "";
  // in chunks, so that a big thumbnail doesn't blow the argument limit
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return str;
};

const evenUp = (offset) => offset + (offset % 2);


// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

const readTiff = (tiff) => {
  const order = String.fromCharCode(tiff[0], tiff[1]);
  if (order !== "MM" && order !== "II") {
    throw new Error("Unknown byte order in Exif block");
  }
  const bigEndian = order === "MM";

  const u16 = (offset) => bigEndian
    ? (tiff[offset] << 8) | tiff[offset + 1]
    : (tiff[offset + 1] << 8) | tiff[offset];

  const u32 = (offset) => {
    const bytes = bigEndian
      ? [tiff[offset], tiff[offset + 1], tiff[offset + 2], tiff[offset + 3]]
      : [tiff[offset + 3], tiff[offset + 2], tiff[offset + 1], tiff[offset]];
    return ((bytes[0] * 0x1000000) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]);
  };

  if (u16(2) !== 42) {
    throw new Error("Not a TIFF header in Exif block");
  }

  const readIfd = (offset, name) => {
    if (offset + 2 > tiff.length) {
      throw new Error(`IFD ${name} is out of the Exif block`);
    }
    const count = u16(offset);
    const entriesEnd = offset + 2 + count * 12;
    if (entriesEnd > tiff.length) {
      throw new Error(`Entries of IFD ${name} are out of the Exif block`);
    }

    const entries = [];
    for (let i = 0; i < count; i++) {
      const entryOffset = offset + 2 + i * 12;
      const tag = u16(entryOffset);
      const type = u16(entryOffset + 2);
      const valueCount = u32(entryOffset + 4);
      const typeSize = TYPE_SIZES[type];
      if (!typeSize) {
        throw new Error(`Unknown value type ${type} of tag ${tag} in IFD ${name}`);
      }

      const size = typeSize * valueCount;
      const inline = tiff.subarray(entryOffset + 8, entryOffset + 12);
      let value = null;
      if (size > 4) {
        const valueOffset = u32(entryOffset + 8);
        if (valueOffset + size > tiff.length) {
          throw new Error(`Value of tag ${tag} in IFD ${name} is out of the Exif block`);
        }
        value = tiff.subarray(valueOffset, valueOffset + size);
      }

      entries.push({tag, type, count: valueCount, size, inline, value});
    }

    // piexifjs doesn't write the next IFD offset of a sub-IFD at all,
    // so read it only when it fits into the block
    const next = entriesEnd + 4 <= tiff.length ? u32(entriesEnd) : 0;

    return {name, entries, next};
  };

  const zeroth = readIfd(u32(4), "0th");
  const ifds = [zeroth];

  const readSub = (ifd, pointerTag, name) => {
    const entry = ifd.entries.find(e => e.tag === pointerTag);
    if (!entry) {
      return null;
    }
    const pointer = bigEndian
      ? ((entry.inline[0] * 0x1000000) + (entry.inline[1] << 16) + (entry.inline[2] << 8) + entry.inline[3])
      : ((entry.inline[3] * 0x1000000) + (entry.inline[2] << 16) + (entry.inline[1] << 8) + entry.inline[0]);
    const sub = readIfd(pointer, name);
    sub.pointerEntry = entry;
    return sub;
  };
  const exif = readSub(zeroth, EXIF_IFD_POINTER, "Exif");
  if (exif) {
    ifds.push(exif);
    const interop = readSub(exif, INTEROP_IFD_POINTER, "Interop");
    if (interop) {
      ifds.push(interop);
    }
  }

  const gps = readSub(zeroth, GPS_IFD_POINTER, "GPS");
  if (gps) {
    ifds.push(gps);
  }

  let thumbnail = null;
  if (zeroth.next) {
    const first = readIfd(zeroth.next, "1st");
    const offsetEntry = first.entries.find(e => e.tag === THUMBNAIL_OFFSET);
    const lengthEntry = first.entries.find(e => e.tag === THUMBNAIL_LENGTH);
    if (offsetEntry && lengthEntry) {
      const thumbnailOffset = bigEndian
        ? ((offsetEntry.inline[0] * 0x1000000) + (offsetEntry.inline[1] << 16) +
           (offsetEntry.inline[2] << 8) + offsetEntry.inline[3])
        : ((offsetEntry.inline[3] * 0x1000000) + (offsetEntry.inline[2] << 16) +
           (offsetEntry.inline[1] << 8) + offsetEntry.inline[0]);
      const thumbnailLength = bigEndian
        ? ((lengthEntry.inline[0] * 0x1000000) + (lengthEntry.inline[1] << 16) +
           (lengthEntry.inline[2] << 8) + lengthEntry.inline[3])
        : ((lengthEntry.inline[3] * 0x1000000) + (lengthEntry.inline[2] << 16) +
           (lengthEntry.inline[1] << 8) + lengthEntry.inline[0]);
      if (thumbnailOffset + thumbnailLength > tiff.length) {
        throw new Error("Thumbnail is out of the Exif block");
      }
      thumbnail = {
        bytes: tiff.subarray(thumbnailOffset, thumbnailOffset + thumbnailLength),
        offsetEntry,
        lengthEntry,
      };
    }
    ifds.push(first);
  }

  return {bigEndian, ifds, thumbnail};
};


// ---------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------

const writeTiff = ({bigEndian, ifds, thumbnail}) => {
  // IFDs go in the order they were read: 0th, Exif, Interop, GPS, 1st.
  // Values of an IFD follow its entries, the thumbnail goes last.
  let cursor = 8;
  ifds.forEach(ifd => {
    ifd.offset = cursor;
    cursor += 2 + ifd.entries.length * 12 + 4;
    ifd.entries.forEach(entry => {
      if (entry.size > 4) {
        cursor = evenUp(cursor);
        entry.valueOffset = cursor;
        cursor += entry.size;
      }
    });
  });
  if (thumbnail) {
    cursor = evenUp(cursor);
    thumbnail.offset = cursor;
    cursor += thumbnail.bytes.length;
  }

  const tiff = new Uint8Array(cursor);

  const putU16 = (offset, value) => {
    if (bigEndian) {
      tiff[offset] = (value >> 8) & 0xff;
      tiff[offset + 1] = value & 0xff;
    } else {
      tiff[offset] = value & 0xff;
      tiff[offset + 1] = (value >> 8) & 0xff;
    }
  };

  const putU32 = (offset, value) => {
    const bytes = [
      Math.floor(value / 0x1000000) & 0xff,
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ];
    if (!bigEndian) {
      bytes.reverse();
    }
    tiff.set(bytes, offset);
  };

  tiff[0] = bigEndian ? 0x4d : 0x49;
  tiff[1] = tiff[0];
  putU16(2, 42);
  putU32(4, ifds[0].offset);

  const findIfd = (name) => ifds.find(ifd => ifd.name === name);
  const firstIfd = findIfd("1st");

  if (thumbnail) {
    putU32Inline(thumbnail.offsetEntry.inline, thumbnail.offset, bigEndian);
  }

  ifds.forEach(ifd => {
    // sub-IFD pointers must lead to the new positions
    const subPointers = [
      [EXIF_IFD_POINTER, "Exif"],
      [GPS_IFD_POINTER, "GPS"],
      [INTEROP_IFD_POINTER, "Interop"],
    ];
    subPointers.forEach(([tag, name]) => {
      const entry = ifd.entries.find(e => e.tag === tag);
      const sub = findIfd(name);
      if (entry && sub) {
        putU32Inline(entry.inline, sub.offset, bigEndian);
      }
    });

    // tags must be written in ascending order
    const entries = ifd.entries.slice().sort((a, b) => a.tag - b.tag);

    putU16(ifd.offset, entries.length);
    entries.forEach((entry, index) => {
      const entryOffset = ifd.offset + 2 + index * 12;
      putU16(entryOffset, entry.tag);
      putU16(entryOffset + 2, entry.type);
      putU32(entryOffset + 4, entry.count);
      if (entry.size > 4) {
        putU32(entryOffset + 8, entry.valueOffset);
        tiff.set(entry.value, entry.valueOffset);
      } else {
        tiff.set(entry.inline, entryOffset + 8);
      }
    });

    // every IFD ends with the offset of the next one, 0 when there is none
    const nextOffset = ifd.offset + 2 + entries.length * 12;
    putU32(nextOffset, (ifd.name === "0th" && firstIfd) ? firstIfd.offset : 0);
  });

  if (thumbnail) {
    tiff.set(thumbnail.bytes, thumbnail.offset);
  }

  return tiff;
};

function putU32Inline(inline, value, bigEndian) {
  const bytes = [
    Math.floor(value / 0x1000000) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
  if (!bigEndian) {
    bytes.reverse();
  }
  inline.set(bytes);
}


// ---------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------

/**
 * Takes and returns an Exif block as a binary string, the format piexifjs
 * uses ("Exif\0\0" + TIFF). Returns the block unchanged if it can't be
 * parsed - a suspicious layout is still better than a broken file.
 */
export const normalizeExifBytes = (exifBytes) => {
  try {
    const hasPrefix = exifBytes.slice(0, EXIF_PREFIX.length) === EXIF_PREFIX;
    const tiffString = hasPrefix ? exifBytes.slice(EXIF_PREFIX.length) : exifBytes;
    const tiff = readTiff(binaryStringToBytes(tiffString));
    const normalized = bytesToBinaryString(writeTiff(tiff));
    return hasPrefix ? EXIF_PREFIX + normalized : normalized;
  } catch (error) {
    console.error("Can not normalize Exif block, leaving it as is", error);
    return exifBytes;
  }
};
