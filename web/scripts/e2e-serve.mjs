/**
 * Serve `out/` and proxy `/api/*` → API (default 127.0.0.1:8000) for Playwright.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "out");
const port = Number(process.env.E2E_PORT || 4173);
const api =
  process.env.DICTABLY_API_PROXY?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webm": "video/webm",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function proxyApi(req, res) {
  const target = new URL(req.url, api);
  const headers = { ...req.headers, host: target.host };
  const upstream = http.request(
    target,
    { method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    send(res, 502, "API unavailable");
  });
  req.pipe(upstream);
}

function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  const asHtml = `${file}.html`;
  if (fs.existsSync(asHtml) && fs.statSync(asHtml).isFile()) return asHtml;
  return null;
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    send(res, 400, "Bad request");
    return;
  }
  if (req.url.startsWith("/api/") || req.url === "/api") {
    proxyApi(req, res);
    return;
  }
  const file = resolveFile(req.url);
  if (!file) {
    send(res, 404, "Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  send(res, 200, fs.readFileSync(file), {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`e2e-serve http://127.0.0.1:${port} → static + ${api}`);
});
