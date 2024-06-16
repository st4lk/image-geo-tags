var path = require("path");
const webpack = require("webpack");
// const CopyPlugin = require('copy-webpack-plugin');

const CleanWebpackPlugin = require("clean-webpack-plugin");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MinifyPlugin = require("babel-minify-webpack-plugin");
// const {GenerateSW} = require("workbox-webpack-plugin");
// const {NetworkFirst} = require('workbox-strategies');
// import {NetworkFirst} from 'workbox-strategies';

// const ENABLE_SW = JSON.stringify(process.env.ENABLE_SW);

let assetsPath = 'assets';

const config = {
  mode: "development",
  output: {
    filename: `${assetsPath}/[name]-[hash].js`,
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
  },
  resolve: {
    extensions: [".mjs", ".js", ".json"],
    modules: [path.resolve(__dirname, "src"), "node_modules"],
  },
  plugins: [
    new CleanWebpackPlugin(["dist"]),
    new ExtractTextPlugin(`${assetsPath}/[name]-[contenthash].css`),
    new HtmlWebpackPlugin({
      title: "Геолокация фото",
      template: "src/index.tmpl",
      environment: JSON.stringify(process.env.NODE_ENV || 'development'),
      // enableSW: ENABLE_SW ? JSON.stringify(true) : JSON.stringify(process.env.NODE_ENV !== 'development'),
      enableSW: JSON.stringify(false),
    }),
    // new CopyPlugin({
    //   patterns: [
    //     {from: './src/service-worker.js', to: ''},
    //   ],
    // }),
    // new GenerateSW({
    //   navigationPreload: true,
    //   exclude: ['/index.html'],
    //   runtimeCaching: [
    //     // {
    //     //     urlPattern: /images/,
    //     //     handler: 'cacheFirst'
    //     // },
    //     // {
    //     //     urlPattern: new RegExp('^https://fonts.(?:googleapis|gstatic).com/(.*)'),
    //     //     handler: 'cacheFirst'
    //     // },
    //     {
    //         urlPattern: '/',
    //         handler: 'NetworkOnly'
    //         // handler: new NetworkFirst({networkTimeoutSeconds: 4}),
    //     },
    //     {
    //         urlPattern: '/index.html',
    //         handler: 'NetworkOnly'
    //         // handler: new NetworkFirst({networkTimeoutSeconds: 10})
    //     },
    //     {
    //         urlPattern: new RegExp('/.*'),
    //         handler: 'NetworkOnly'
    //         // handler: new NetworkFirst({networkTimeoutSeconds: 10})
    //     },
    //     {
    //         urlPattern: new RegExp('.*'),
    //         handler: 'NetworkOnly'
    //         // handler: new NetworkFirst({networkTimeoutSeconds: 10})
    //     },
    //   ]
    // }),
  ],
  module: {
    rules: [
      {
        test: /\.js?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
          },
        ]
      },
      {
        test: /\.(svg|png|jpg|jpeg)$/,
        use: [
          {
            loader: "file-loader",
            options: {
              hash: "sha512",
              digest: "hex",
              name: `${assetsPath}/[hash].[ext]`,
            }
          },
        ]
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          use: [
            {
              loader: "css-loader",
              options: {
                modules: true,
              },
            }
          ],
        })
      },
      {
        test: /\.scss$/,
        use: ExtractTextPlugin.extract({
          use: [
            {
              loader: "css-loader",
              options: {
                modules: true,
              },
            },
            {
              loader: "sass-loader",
            },
          ],
        })
      }
    ]
  }
};

if (process.env.NODE_ENV == "production") {
  config.entry = "./src/index.js";
  config.devtool = "source-map";
  config.mode = "production";
  config.plugins = config.plugins.concat([
    new MinifyPlugin({}, {}),
  ]);
} else {
  config.entry = [
    "webpack-dev-server/client?http://localhost:8080",
    "webpack/hot/only-dev-server",
    "react-hot-loader/patch",
    "./src/index.js"
  ];
  config.devtool = "source-map";
  config.plugins.push(new webpack.HotModuleReplacementPlugin());
  config.plugins.push(new webpack.NamedModulesPlugin());
}

module.exports = config;
