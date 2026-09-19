"use strict";

const path = require("path");

/**
 * Webpack build for the webview client bundle.
 * Runs inside a VS Code webview (browser context), so the target is `web`.
 * The mode is supplied on the CLI (`--mode production` / `--mode development`).
 *
 * @type {import('webpack').Configuration}
 */
module.exports = {
  target: "web",
  entry: "./client/index.tsx",
  output: {
    path: path.resolve(__dirname, "out", "build"),
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.client.json",
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  devtool: "source-map",
  performance: {
    // This bundle runs in a local VS Code webview, not over the network.
    hints: false,
  },
};
