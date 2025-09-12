const path = require("path")
const TerserPlugin = require("terser-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const CopyWebpackPlugin = require("copy-webpack-plugin") // <-- BU SATIRI EKLEYİN
let packagedeps = require("./package.json")

module.exports = {
  entry: {
    vendor: Object.keys(packagedeps.dependencies),
    index: { dependOn: "vendor", import: "./src/index.ts" },
    diagram: { dependOn: "vendor", import: "./src/diagrams.ts" },
    mathaven: { dependOn: "vendor", import: "./src/mathaven.ts" },
    compare: { dependOn: "vendor", import: "./src/compare.ts" },
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "swc-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    allowedHosts: [".gitpod.io"],
    host: "0.0.0.0",
    compress: true,
    port: 8080,
    client: {
      progress: true,
    },
  },
  performance: { hints: false },
  mode: "production",
  optimization: {
    // ...
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./index.html",
      chunks: ["vendor", "index"],
      filename: "index.html"
    }),
    new CopyWebpackPlugin({ 
      patterns: [
        { from: "public", to: "." } 
      ]
    })
  ],
  stats: {
    errorDetails: true,
  },
  cache: {
    type: "filesystem",
  },
}