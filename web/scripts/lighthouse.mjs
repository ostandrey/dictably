/**
 * Serve out/ with precomputed gzip and run Lighthouse mobile on / and /uk/.
 * 3 passes per URL → median (Lighthouse variance).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "out");
const port = 4177;
const PASSES = 3;
// T-001 N2: shared CI runners are noisier — Perf ≥ 90 in CI; local stays ≥ 95.
const PERF_MIN = process.env.CI ? Number(process.env.LH_PERF_MIN || 90) : 95;
const OTHER_MIN = 95;

if (!existsSync(path.join(root, "index.html"))) {
  console.error("Missing out/index.html — run pnpm build:local first");
  process.exit(1);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

const rawCache = new Map();
const gzCache = new Map();

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const candidates = [
    path.join(root, p),
    path.join(root, `${p}.html`),
    path.join(root, p, "index.html"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function readRaw(file) {
  if (!rawCache.has(file)) rawCache.set(file, readFileSync(file));
  return rawCache.get(file);
}

function readGzip(file) {
  if (!gzCache.has(file)) gzCache.set(file, gzipSync(readRaw(file), { level: 6 }));
  return gzCache.get(file);
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url || "/");
  if (!file) {
    res.writeHead(404);
    res.end("404");
    return;
  }
  const ext = path.extname(file);
  const type = mime[ext] || "application/octet-stream";
  const accept = req.headers["accept-encoding"] || "";
  const useGzip =
    accept.includes("gzip") && !ext.match(/\.(png|jpg|woff2|ico)$/);
  res.setHeader("Content-Type", type);
  if (useGzip) {
    res.setHeader("Content-Encoding", "gzip");
    res.end(readGzip(file));
  } else {
    res.end(readRaw(file));
  }
});

function runLh(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "dlx",
        "lighthouse",
        url,
        "--quiet",
        "--chrome-flags=--headless --no-sandbox",
        "--only-categories=performance,accessibility,best-practices,seo",
        "--form-factor=mobile",
        "--screenEmulation.mobile",
        "--output=json",
        "--output-path=stdout",
      ],
      { shell: true, env: process.env },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `lighthouse exit ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`parse failed: ${e}\n${out.slice(0, 500)}`));
      }
    });
  });
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function scoreRow(report) {
  const cats = report.categories;
  return {
    performance: Math.round(cats.performance.score * 100),
    accessibility: Math.round(cats.accessibility.score * 100),
    bestPractices: Math.round(cats["best-practices"].score * 100),
    seo: Math.round(cats.seo.score * 100),
  };
}

server.listen(port, "127.0.0.1", async () => {
  // Warm gzip cache for main routes before first Lighthouse pass
  for (const warm of ["/", "/uk/", "/_next/static"]) {
    resolveFile(warm);
  }
  const paths = ["/", "/uk/"];
  const results = [];
  try {
    for (const p of paths) {
      const url = `http://127.0.0.1:${port}${p}`;
      const passes = [];
      for (let i = 0; i < PASSES; i++) {
        console.log(`Lighthouse mobile ${url} (pass ${i + 1}/${PASSES})`);
        const report = await runLh(url);
        const row = scoreRow(report);
        passes.push(row);
        console.log(" ", row);
      }
      const med = {
        path: p,
        performance: median(passes.map((x) => x.performance)),
        accessibility: median(passes.map((x) => x.accessibility)),
        bestPractices: median(passes.map((x) => x.bestPractices)),
        seo: median(passes.map((x) => x.seo)),
      };
      results.push(med);
      console.log(" median", med);
    }
    const fail = results.filter(
      (r) =>
        r.performance < PERF_MIN ||
        r.accessibility < OTHER_MIN ||
        r.bestPractices < OTHER_MIN ||
        r.seo < OTHER_MIN,
    );
    if (fail.length) {
      console.error(
        `Lighthouse median below thresholds (perf≥${PERF_MIN}, others≥${OTHER_MIN}):`,
        fail,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `All median categories OK (perf≥${PERF_MIN}, others≥${OTHER_MIN})`,
      );
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
