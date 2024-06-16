Strava issue
------------
Strava doesn't show images in map after modification of this tool.
Possible reason: tool produce Big-Endian byte ordering for exif data. Whereas strava works with little-endian byte ordering. In fact I think this is not a Big/Little endian. There is something wrong in pack/unpack of the tool so strava rejects it's GPS data. Anyway, if attach GPS with webloc then modify image with exiftool (change to little ending) - it is working in strava.

The fix with exiftool:
```bash
exiftool -all= -tagsfromfile IMG_9334_small_imgloc_dev_little_endian.JPG -all:all -unsafe -exifbyteorder=little-endian IMG_9334_small_imgloc_dev_little_endian.JPG
```

check endian:
```bash
exiftool IMG_9334_small_imgloc_dev_little_endian.JPG | grep endian
```

### change big ending -> little endian header in piexifjs.js
```javascript
        // var header = "Exif\x00\x00\x4d\x4d\x00\x2a\x00\x00\x00\x08";  // original
        var header = "Exif\x00\x00\x49\x49\x00\x2a\x00\x00\x00\x08";
````

Examples
--------
```bash
exiftool -D -g /../Pictures/2022.05.07\ Velo\ Test\ Photo/phone/phone_original_20220507_170414.jpg
exiftool -g -D /../Downloads/phone_modified_20220507_170414_v2_2.jpg

exiftool -b -ThumbnailImage /../Downloads/phone_original_20220507_170414.jpg
```

Exif in JS
----------
https://getaround.tech/exif-data-manipulation-javascript/
https://stackoverflow.com/a/14115795/821594


Other Q/A
---------

- What elements data.GPS from EXIF has?

    https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/gps.html

- How to clean up file?

    ```bash
    cd ~/Downloads/
    xattr -d com.apple.metadata:kMDItemWhereFroms /.../Downloads/phone_13_remodified_20220507_170414.jpg
    touch -t 202205071744 phone_13_remodified_20220507_170414.jpg
    ```

- How to make "Scene Type" be the same in modified image?

    Go to
    /.../develop/image_locations/node_modules/piexifjs/piexif.js

    and modify this:
    ```js
            41729: {
                'name': 'SceneType',
                'type': 'Undefined'
            },
    ```

    to this:

    ```js
            41729: {
                'name': 'SceneType',
                'type': 'Short'
            },
    ```

- Houston we have a problem

    https://github.com/hMatoba/piexifjs/issues/68

    original - 1158
    2        - 1122
    4        - 1086
