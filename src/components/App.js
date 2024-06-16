import React, {Component} from "react";
import PropTypes from "prop-types";
import {renderRoutes} from "react-router-config";
import {MuiThemeProvider, createMuiTheme, withStyles} from "@material-ui/core/styles";
import {deepOrange} from "@material-ui/core/colors";

import AppBar from "./inline/AppBar";

const theme = createMuiTheme({
  palette: {
    primary: deepOrange,  // App bar color (indigo by default)
    background: {
      default: "#fff",
    }
  },
});

const styles = () => ({
  rootRoot: {
  },
  root: {
    width: "100%",
    height: "100%",
    zIndex: 1,
    overflow: "hidden",
  },
  appFrame: {
    display: "flex",
    width: "100%",
    height: "100%",
  },
  content: {
    backgroundColor: theme.palette.background.default,
    width: "100%",
    padding: "8px",
    height: "calc(100% - 56px)",
    marginTop: 56,
    [theme.breakpoints.up("sm")]: {
      height: "calc(100% - 64px)",
      marginTop: 64,
    },
  },
});


class App extends Component {

  render() {
    const {classes, route} = this.props;

    let content = null;
    content = renderRoutes(route.routes);

    return (
      <MuiThemeProvider theme={theme}>
        <div>
          {content}
        </div>
      </MuiThemeProvider>
    );
  }
}


App.propTypes = {
  classes: PropTypes.object.isRequired,
  route: PropTypes.object.isRequired,
};

export default withStyles(styles)(App);
