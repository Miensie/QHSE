const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = {
  entry: {
    taskpane: "./src/taskpane/taskpane.js",
    commands: "./src/commands/commands.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  resolve: { extensions: [".js"] },
  module: {
    rules: [
      { test: /\.js$/, use: "babel-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      { test: /\.(png|svg|ico)$/, type: "asset/resource" },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "taskpane.html",
      template: "./src/taskpane/taskpane.html",
      chunks: ["taskpane"],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/assets", to: "assets" },
        { from: "manifest.xml", to: "manifest.xml" },
      ],
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
    headers: { "Access-Control-Allow-Origin": "*" },
    server: {
      type: "https",
      options: {
        ca: `${process.env.USERPROFILE}/.office-addin-dev-certs/ca.crt`,
        key: `${process.env.USERPROFILE}/.office-addin-dev-certs/localhost.key`,
        cert: `${process.env.USERPROFILE}/.office-addin-dev-certs/localhost.crt`,
      },
    },
  },
};
