import React, {Component} from "react";
import PropTypes from "prop-types";
import classNames from 'classnames';

import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import CircularProgress from '@material-ui/core/CircularProgress';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import ArrowDropUpIcon from '@material-ui/icons/ArrowDropUp';
import TextField from '@material-ui/core/TextField';
import Link from '@material-ui/core/Link';
import Collapse from '@material-ui/core/Collapse';
import {saveAs} from 'file-saver';
import modifyExif from 'modify-exif';
import xmlJS from 'xml-js';
import {parse as parseDate, parseISO as parseISODate} from 'date-fns';
import DmsCoordinates from 'dms-conversion';

import {withStyles} from "@material-ui/core/styles";

const URL_REGEX = new RegExp(/(https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi);

const styles = theme => ({
  homeRoot: {
  },
  homeRootFull: {
    top: 0,
    [theme.breakpoints.up("sm")]: {
      top: 0,
    },
  },
  greetings: {
    padding: "8px",
    margin: "8px",
    height: "calc(100% - 32px)",
  },

  wrapper: {
    position: "absolute",
    left: 0,
    bottom: 0,
    right: 0,
    top: 0,
    zIndex: 100,

    padding: "15px",
    textAlign: "left",
  },

  buttons: {
    marginLeft: 10,
  },

  imageToLabel: {
    height: "100%",
    width: "auto",
    maxWidth: "100%",
  },

  imageButtonsFlex: {
    display: "flex",
    justifyContent: "space-between",
    position: "absolute",
    left: 10,
    bottom: 10,
    right: 10,
    top: 10,
  },

  imageFlex: {
    maxWidth: "60%",
  },

  imagePreviews: {
    listStyleType: "none",
  },

  imagePreviewsListElem: {
    maxWidth: "100%",
    display: "flex",
  },

  imagePreviewsImg: {
    maxWidth: "30%",
    margin: "10px",
  },

  imageLoader: {
    margin: "10px",
  },

  hidden: {
    display: "none",
  },

  errorMsg: {
    color: "red",
  }

});

const i18n = {
  'ru': {
    'upload_gpx': 'Загрузить GPX файл',
    'gpx_no_time': 'В GPX файле нет временных отметок',
    'adopt_for_strava': 'Адаптировать для Strava',
    'strava_loc_1': 'По каким-то причинам, Strava не распознает локации у фото, проставленные здесь. Это можно исправить скриптом ',
  },
  'en': {
    'upload_gpx': 'Upload GPX File',
    'gpx_no_time': 'No time in GPX file',
    'adopt_for_strava': 'Adopt for Strava',
    'strava_loc_1': "For some reason Strava doesn't recognize image geo tags set by current tool. It can be fixed by script ",
  },
}


const bashCode = `#!/bin/bash

for file in $(dirname "$0")/images/*
do
  exiftool -all= -tagsfromfile $\{file} -all:all -unsafe -exifbyteorder=little-endian $\{file}
  rm $\{file}_original
done
`

class PreFormattedCode extends React.Component {
    render() {
      return <React.Fragment>{bashCode}</React.Fragment>
    }
}


class Home extends Component {

  state = {
    imageList: [],

    trackGPXFile: null,
    trackGPXData: null,
    isGPXValid: false,
    gpxValidationError: null,
    adoptForStravaExpand: false,
    stavaActivityURL: '',
    stravaURLLoadiong: false,
    stravaActivityURLFromPopup: '',
  }

  componentDidMount() {
  }

  onChange = async e => {
    const files = Array.from(e.target.files);
    const imageList = files.map(file => {
      return {
        file,
        url: URL.createObjectURL(file),
        isImageLoading: true,
        isLoading: true,
        blob: null,
        location: null,
      };
    });
    this.setState({imageList});

    for (const imageIndex in imageList) {
      await this.assignLocation(imageList[imageIndex], imageIndex);
    }
  }

  onTrackChange = e => {
    const files = Array.from(e.target.files);
    this.setState({trackGPXFile: files[0]});
    this.parseGPX(files[0]);
  }

  getI18n = (text_title) => {
    let key = 'ru';
    if (this.props.match.path.startsWith('/en/')) {
      key = 'en';
    }
    return i18n[key][text_title];
  }

  parseGPX = (GPXFile) => {

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      const jsonStr = xmlJS.xml2json(fileContent, {compact: true});
      const data = JSON.parse(jsonStr);
      this.setState({trackGPXData: data});
      this.validateGPXData(data);
    };
    reader.readAsText(GPXFile);
  }

  validateGPXData = (gpxData) => {
    const gpxPoints = this.getGPXPoints(gpxData);
    if (!gpxPoints[0].time) {
      this.setState({
        isGPXValid: false,
        gpxValidationError: this.getI18n('gpx_no_time'),
      })
    } else {
      this.setState({
        isGPXValid: true,
        gpxValidationError: null,
      })
    }
  }

  convertGPXDecimalToDegree = (decimalLat, decimalLon) => {
    const dmsCoords = new DmsCoordinates(decimalLat, decimalLon);
    const {longitude, latitude} = dmsCoords.dmsArrays;

    const [latD, latM, latS, latNsew] = latitude;
    const [lonD, lonM, lonS, lonNsew] = longitude;
    return [
      // latitude
      {'degree': latD, 'minute': latM, 'second': latS, 'millisecond': Math.round(latS * 1000), 'direction': latNsew},
      // longitude
      {'degree': lonD, 'minute': lonM, 'second': lonS, 'millisecond': Math.round(lonS * 1000), 'direction': lonNsew},
    ];
  }

  _getGPXPointTime = (point) => {
    return parseISODate(point.time._text);
  }

  findNearest = (inputTime, timaA, timeB, pointA, pointB) => {
    const xa = Math.abs(inputTime - timaA);
    const xb = Math.abs(inputTime - timeB);
    return xa > xb ? pointB : pointA;
  }

  findLocation = (gpxPoints, imageTime) => {
    let startIndex = 0;
    let endIndex = gpxPoints.length - 1;
    let midIndex;
    let midTime;
    let elevation;
    let lat;
    let lon;
    let count = 0;

    while (startIndex < endIndex) {
      midIndex = startIndex + Math.ceil((endIndex - startIndex) / 2);
      midTime = this._getGPXPointTime(gpxPoints[midIndex]);
      if (imageTime > midTime) {
        startIndex = midIndex;
      } else {
        endIndex = midIndex;
      }
      if ((endIndex - startIndex) === 1) {
        const point = this.findNearest(
          imageTime,
          this._getGPXPointTime(gpxPoints[startIndex]),
          this._getGPXPointTime(gpxPoints[endIndex]),
          gpxPoints[startIndex],
          gpxPoints[endIndex],
        );
        lat = point._attributes.lat;
        lon = point._attributes.lon;
        elevation = point.ele._text;
        console.log(`Iterations number: ${count}`);
        return [lat, lon, elevation];
      }
      count += 1;
      if (count > gpxPoints.length) {
        console.error('Error in search algorithm', gpxPoints, imageTime);
        break;
      }
    }
  }

  getGPXPoints = (gpxData) => {
    let gpxPoints;
    if (gpxData.gpx.trk.trkseg.trkpt) {
      gpxPoints = gpxData.gpx.trk.trkseg.trkpt;
    } else {
      gpxPoints = gpxData.gpx.trk.trkseg.map(elem => elem.trkpt).flat(1);
    }
    return gpxPoints;
  }

  findCoordinateForTime = (gpxData, time) => {
    console.log(`Parsing date from ${time}`);

    // Example of time: "2020:11:07 13:20:13"
    const inputTime = parseDate(time, 'yyyy:MM:dd HH:mm:ss', new Date());
    console.log(`inputTime: ${inputTime}`);
    // we are making an assumption that GPX and image are given in the same timezone
    // TODO: Find a working way how to get timezone from location, the code bolew returns undefined
    // imageTime = timespace.getFuzzyLocalTimeFromPoint([lat, lon], inputTime);
    let imageTime = inputTime;  

    const gpxPoints = this.getGPXPoints(gpxData);
    const firstPointTime = this._getGPXPointTime(gpxPoints[0]);
    const lastPointTime = this._getGPXPointTime(gpxPoints.slice(-1)[0]);
    if (
      gpxPoints &&
      imageTime > firstPointTime &&
      imageTime < lastPointTime
    ) {
      const binary = this.findLocation(gpxPoints, imageTime);
      return binary;
    }
    return [null, null, null];  // lat, lon, elevation
  }

  saveImage = async (imageData) => {
    await saveAs(imageData.blob, imageData.file.name);  // TODO: uncomment me
  }

  assignLocation = (imageData, imageIndex) => {
    return new Promise((resolve) => {
      console.log('Processing image', imageIndex);
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const imageBuffer = Buffer.from(arrayBuffer);
        let decimalLat;
        let decimalLon;

        const newImage = modifyExif(imageBuffer, data => {

          // data.GPS - is an object, but keys are integers (like array).
          // Examples for '/Users/stalk/Pictures/2020.10.10 Velo Tugolesie - Shaturtorf/good/IMG_8067.JPG'

          const GPSVersion = 0;  // [2, 3, 0, 0]
          const GPSLatitudeSide = 1;  // "N"
          const GPSLatitudeValue = 2;  // [[55, 1], [23, 1], [5883, 1000]]
          const GPSLongitudeSide = 3;  // "E"
          const GPSLongitudeValue = 4;  // [[39, 1], [20, 1], [14793, 1000]]
          // const GPSWTF = 5;  // 0  (probable it is "Altitude Reference", 0 means "above sea level")
          // const GPSAltitude = 6;  // [1461, 10]
          // const GPSTime = 7;  // [[11, 1], [2, 1], [52000, 1000]]
          // const GPSStatus = 9;  // "A"
          // const GPSMapDatum = 18;  // "WGS-84"
          // const GPSDate = 29;  // "2020:10:10"

          const EXIF_DateTimeOriginal = 36867;

          const dateTimeOriginal = data.Exif[EXIF_DateTimeOriginal];

          // TODO: respect elevation somehow
          // eslint-disable-next-line no-unused-vars
          const [lat, lon, elevation] = this.findCoordinateForTime(this.state.trackGPXData, dateTimeOriginal);
          if (lat && lon) {
            // TODO apply convertGPXDecimalToDegree for lat and lon
            decimalLat = Number.parseFloat(lat);
            decimalLon = Number.parseFloat(lon);
            const [dmsLat, dmsLon] = this.convertGPXDecimalToDegree(decimalLat, decimalLon);

            // Modify the file
            data.GPS = data.GPS || {};
            // set GPS version
            data.GPS[GPSVersion] = [2, 0, 0, 0];
            // latitude
            const latitudeSide = dmsLat.direction;
            const latitudeValue = [[dmsLat.degree, 1], [dmsLat.minute, 1], [dmsLat.millisecond, 1000]];
            console.log('Applying latitude', latitudeSide, latitudeValue);
            data.GPS[GPSLatitudeSide] = latitudeSide;
            data.GPS[GPSLatitudeValue] = latitudeValue;
            // longitue
            const longitudeSide = dmsLon.direction;
            const longitudeValue = [[dmsLon.degree, 1], [dmsLon.minute, 1], [dmsLon.millisecond, 1000]];
            console.log('Applying longitude', longitudeSide, longitudeValue);
            data.GPS[GPSLongitudeSide] = longitudeSide;
            data.GPS[GPSLongitudeValue] = longitudeValue;
          } else {
            console.log(`Ooops, looks like image ${imageData.file} wasn't taken during the track time.`);
          }
        }, {'keepDateTime': true});

        const newImageBlob = new Blob([newImage], {
          type: imageData.file.type,
        });

        const location = (decimalLon && decimalLon) ? [decimalLat, decimalLon] : null;

        this.updateImageInState(
          imageIndex,
          newImageBlob,
          location,
          false,  // isLoading
        );
        resolve();
      };
      reader.readAsArrayBuffer(imageData.file);
    });
  }

  updateImageInState = (imageIndex, imageBlob, location, isLoading) => {
    let stateImageList = [...this.state.imageList];
    let stateImageData = {...stateImageList[imageIndex]};
    stateImageData.blob = imageBlob;
    stateImageData.isLoading = isLoading;
    stateImageData.location = location;
    stateImageList[imageIndex] = stateImageData;
    this.setState({imageList: stateImageList});
  }

  updateImageLoading = (imageIndex, isImageLoading) => {
    let stateImageList = [...this.state.imageList];
    let stateImageData = {...stateImageList[imageIndex]};
    stateImageData.isImageLoading = isImageLoading;
    stateImageList[imageIndex] = stateImageData;
    this.setState({imageList: stateImageList});
  }

  timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  handleSaveAll = async () => {
    for (const imageIndex in this.state.imageList) {
      await this.saveImage(this.state.imageList[imageIndex]);
      // Looks like browser has a limit for concurrent download:
      // only first 10 image are saved
      // Haven't found a way how to understand that file was downloaded. Not sure it is possible:
      // JS may not have access to events from file system. To fix it, add timeout.
      // Not very robust, but it seems working.
      await this.timeout(1000);
    }
  }

  handleStravaCollapse = () => {
    this.setState({
      adoptForStravaExpand: !this.state.adoptForStravaExpand,
    });
  }

  handleStavaActivityURLChange = (event) => {
    this.setState({stavaActivityURL: event.target.value});
  }

  handleStravaDownload = async () => {
    // window.open('https://www.strava.com/activities/4495618557/export_gpx','popup','width=600,height=600');
    const originalURL = this.state['stavaActivityURL'];
    const urlSearchResults = originalURL.match(URL_REGEX);
    if (!urlSearchResults) {
      alert('Неверная ссылка');
      return false;
    }
    let stavaActivityURL = urlSearchResults[0];
    if (stavaActivityURL.indexOf('strava.app.link') !== -1) {
      // we have link like
      // https://strava.app.link/sm3pzJuAncb
      // very likely it was generated from app, need to convert it into this:
      // https://www.strava.com/activities/4495618557

      // AJAX is not an option: cross origin error
      // iframe is not an option: 'X-Frame-Options' to 'deny' error
      // window popup: it immediately opens strava app
      // another idea: open path in our app, pass strava link in GET params, update window location, return redirected URL somehow to parent
      // Ah, when I try to do this:
      // popup.location.href
      // I get error: Blocked a frame with origin "..." from accessing a cross-origin frame.
      const popup = window.open(window.location.href, 'Strava Activity');
      popup.location.href = stavaActivityURL;
      return false;
    }
    if (stavaActivityURL.indexOf('?') > -1) {
      stavaActivityURL = stavaActivityURL.substr(0, stavaActivityURL.indexOf("?"));
    }
    if (!stavaActivityURL.endsWith('/')) {
      stavaActivityURL += '/';
    }
    stavaActivityURL += 'export_gpx';
    console.log('Result', stavaActivityURL);
    const popup = window.open(window.location.href, 'Strava Activity');
    popup.location.href = stavaActivityURL;
    return false;
  }

  render () {
    const {classes} = this.props;
    const {
      imageList,
      trackGPXFile,
      isGPXValid,
      gpxValidationError,
      adoptForStravaExpand,
      stavaActivityURL,
    } = this.state;

    const downloadLinkTitle = 'Скачать все (с локациями)';

    return (
      <div className={classes.homeRoot}>
        <Paper elevation={4} className={classes.greetings}>
          <div>{this.getI18n('upload_gpx')}</div>
          <div>
            <input type='file' accept='application/xml, application/gpx' onChange={this.onTrackChange} /> 
          </div>
          {gpxValidationError && <div className={classes.errorMsg}>{gpxValidationError}</div>}
          <hr />
          <div>Загрузить фото (можно несколько)</div>
          <div>
            <input
              type='file'
              accept="image/jpg, image/jpeg"
              multiple
              disabled={!isGPXValid}
              onChange={this.onChange} /> 
          </div>
          <div>
            <ul className={classes.imagePreviews}>
              {imageList.map((imageData, index) => {
                return (
                  <li key={`imagePreview_${index}`} className={classes.imagePreviewsListElem}>
                    <img
                      className={classNames({[classes.imagePreviewsImg]: true, [classes.hidden]: imageData.isImageLoading})}
                      onLoad={() => this.updateImageLoading(index, false)}
                      src={imageData.url} />
                    {imageData.isLoading && (
                      <div className={classes.imageLoader}>
                        <CircularProgress />
                      </div>
                    )}
                    {!imageData.isLoading && imageData.location && (
                      <div>
                        {`Location is found: ${imageData.location[0]}, ${imageData.location[1]}`}
                      </div>
                    )}
                    {!imageData.isLoading && !imageData.location && (
                      <div>
                        Couldn&#39;t find location for this image.
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <Button
              color="primary"
              variant="contained"
              disabled={!trackGPXFile || !imageList.length}
              onClick={this.handleSaveAll} >
              {downloadLinkTitle}
            </Button>
          </div>
          <Button
            size="small"
            // disabled={!trackGPXFile || !imageList.length}
            onClick={this.handleStravaCollapse} >
            {this.getI18n('adopt_for_strava')} {adoptForStravaExpand ? <ArrowDropUpIcon /> : <ArrowDropDownIcon />}
          </Button>
          <Collapse in={adoptForStravaExpand}>
            <div>
              {this.getI18n('strava_loc_1')} <code>fix_imgloc.sh</code>:
              <pre><PreFormattedCode /></pre>
              Нужно скачать изображения с этого сайта (кнопка "{downloadLinkTitle}"). Положить в папку <code>images</code> рядом со скриптом и запустить.
              Должна быть установлена утилита <a href="https://exiftool.org/">exiftool</a>.
            </div>
            <div>
              Чтобы фото отображались на карте в strava, они должны быть загружены через мобильное приложение.
              Если вы загрузите их в браузере - на карте они не отобразятся, даже если в фото есть гео метки.
            </div>
          </Collapse>
        </Paper>
      </div>
    );
  }
}

Home.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(Home);
