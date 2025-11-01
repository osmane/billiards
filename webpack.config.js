const path = require("path")
const fs = require("fs")
const DEV_BUILD_ID = (process.env.BUILD_ID) ? String(process.env.BUILD_ID) : (new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6));
const TerserPlugin = require("terser-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const CopyWebpackPlugin = require("copy-webpack-plugin") // <-- BU SATIRI EKLEYÄ°N
let packagedeps = require("./package.json")

module.exports = {
  entry: {
    vendor: Object.keys(packagedeps.dependencies),
    index: { dependOn: "vendor", import: "./src/index.ts" },
    diagram: { dependOn: "vendor", import: "./src/diagrams.ts" },
    mathaven: { dependOn: "vendor", import: "./src/mathaven.ts" },
    compare: { dependOn: "vendor", import: "./src/compare.ts" },
    npcworker: { import: "./src/controller/npc-worker.ts" },
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
    fallback: {
      "fs": false,
      "path": false
    }
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer || !devServer.app) return middlewares;
      const app = devServer.app;
      app.post('/__log', (req, res) => {
        try {
          let body = '';
          req.setEncoding('utf8');
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              let obj;
              try { obj = JSON.parse(body); } catch (e) { obj = { raw: String(body || '').trim() }; }
              obj = obj || {};
              // Use client's browserId if available, otherwise fallback to DEV_BUILD_ID
              const bid = obj.bid || DEV_BUILD_ID;
              const line = JSON.stringify(obj);
              const logsDir = path.resolve(__dirname, 'logs');
              try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {}
              const sid = (obj && (obj.sid || obj.session || (req.headers['x-trace-session']))) || 'default';
              const filePath = path.join(logsDir, 'trajectory-' + bid + '-' + sid + '.log');
              fs.appendFile(filePath, line + '\n', (err) => {
                if (err) { res.statusCode = 500; res.end('append failed'); return; }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true }));
              });
            } catch (err) {
              res.statusCode = 400; res.end('bad json');
            }
          });
        } catch (err) {
          res.statusCode = 500; res.end('error');
        }
      });
      return middlewares;
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
