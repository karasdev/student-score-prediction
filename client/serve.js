// Tiny static file server for the client (Node's built-in http module, no dependencies).
// Does the job of CRA's "npm start", without a build step:
//   /             -> public/index.html
//   /src/...      -> src/ (the app, as browser ES modules)
//   /vendor/...   -> React's browser files from node_modules
//   anything else -> public/
//   a page path like /students/12 (no file extension) -> public/index.html, so the client-side
//   router (src/router.js) can show that page on reload or when opened from a link
//   npm start   -> http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const SRC = path.join(__dirname, "src");
const isProd = process.env.NODE_ENV === "production";

const VENDOR = {
  "/vendor/react.js": `react/umd/react.${isProd ? "production.min" : "development"}.js`,
  "/vendor/react-dom.js": `react-dom/umd/react-dom.${isProd ? "production.min" : "development"}.js`,
};

// React 18 has no ES module build for browsers. These two tiny modules re-export the globals that
// the <script> tags above create, so files in src/ can write  import { useState } from "react"
// (the import map in index.html points "react" and "react-dom/client" here).
const reactExports = Object.keys(require("react")).filter((k) => !k.startsWith("_"));
const MODULES = {
  "/vendor/react.mjs":
    "const React = window.React;\n" +
    "export default React;\n" +
    `export const { ${reactExports.join(", ")} } = React;\n`,
  "/vendor/react-dom-client.mjs":
    "const { createRoot, hydrateRoot } = window.ReactDOM;\n" +
    "export { createRoot, hydrateRoot };\n" +
    "export default { createRoot, hydrateRoot };\n",
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

    if (MODULES[urlPath]) {
      res.writeHead(200, { "Content-Type": TYPES[".js"] });
      return res.end(MODULES[urlPath]);
    }

    let file;
    if (VENDOR[urlPath]) {
      file = path.join(__dirname, "node_modules", VENDOR[urlPath]);
    } else {
      const inSrc = urlPath.startsWith("/src/");
      const root = inSrc ? SRC : PUBLIC;
      file = path.join(root, inSrc ? urlPath.slice("/src".length) : urlPath === "/" ? "index.html" : urlPath);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403); // blocks ../ tricks
        return res.end("Forbidden");
      }
    }

    // page paths have no extension; missing .js/.css files still get a real 404
    const isPage = !path.extname(urlPath) && !urlPath.startsWith("/src/") && !urlPath.startsWith("/vendor/");
    if (isPage && !fs.existsSync(file)) file = path.join(PUBLIC, "index.html");

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
