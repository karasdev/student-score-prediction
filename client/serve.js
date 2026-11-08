// Tiny static file server for the client (Node's built-in http module, no dependencies).
// Serves public/ and React's browser files from node_modules.
//   npm start   -> http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const isProd = process.env.NODE_ENV === "production";

const VENDOR = {
  "/vendor/react.js": `react/umd/react.${isProd ? "production.min" : "development"}.js`,
  "/vendor/react-dom.js": `react-dom/umd/react-dom.${isProd ? "production.min" : "development"}.js`,
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      res.writeHead(400);
      return res.end("Bad request");
    }

    let file;
    if (VENDOR[urlPath]) {
      file = path.join(__dirname, "node_modules", VENDOR[urlPath]);
    } else {
      file = path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath);
      if (!file.startsWith(PUBLIC + path.sep)) {
        res.writeHead(403); // blocks ../ tricks
        return res.end("Forbidden");
      }
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Client running at http://localhost:${PORT}`));
