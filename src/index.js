import React from "react";
import ReactDOM from "react-dom";
import {BrowserRouter} from "react-router-dom";
import {renderRoutes} from "react-router-config";

import {mainRoutes} from "./routes";


ReactDOM.render((
  <BrowserRouter>
    {renderRoutes(mainRoutes)}
  </BrowserRouter>
), document.getElementById("lab-app"));

if (module.hot) {
  module.hot.accept();
}
