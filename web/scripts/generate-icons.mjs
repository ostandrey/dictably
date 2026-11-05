/**
 * Generates favicon + PWA icons from the sidebar speaker-bar mark (T-048).
 * Source of truth: public/icon.svg. Run: pnpm icons
 *
 * S1: favicon = bars only (~90%, transparent); brand icons scale(20) ~62%;
 *     maskable scale(14) inside 80% safe zone.
 */
import { chromium } from "@playwright/test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const appDir = path.join(__dirname, "..", "src", "app");

const CANVAS = "#ffffff";
const SP1 = "#3b6aa8";
const SP2 = "#c2700a";
const SP3 = "#7444c8";

/** Sidebar mark geometry (CSS): 16×18, bars 4px tall, gap 3. */
function markGroup(scale) {
  return `
    <g transform="scale(${scale}) translate(-8 -9)">
      <rect x="0" y="0" width="16" height="4" rx="1.5" fill="${SP1}"/>
      <rect x="5" y="7" width="11" height="4" rx="1.5" fill="${SP2}"/>
      <rect x="2" y="14" width="13" height="4" rx="1.5" fill="${SP3}"/>
    </g>`;
}

/** Brand / apple / PWA "any": rounded canvas + bars. */
function brandSvg({ size, rx, scale }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Dictably">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${CANVAS}"/>
  <g transform="translate(${size / 2} ${size / 2})">
    ${markGroup(scale)}
  </g>
</svg>`;
}

/** Maskable: full bleed canvas, bars inside ~80% safe circle (scale 14 @ 512). */
function maskableSvg({ size, scale }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Dictably">
  <!-- maskable: mark inside central ~80% safe zone -->
  <rect width="${size}" height="${size}" fill="${CANVAS}"/>
  <g transform="translate(${size / 2} ${size / 2})">
    ${markGroup(scale)}
  </g>
</svg>`;
}

/** Favicon: bars only, ~90% of canvas, transparent — no white square. */
function faviconSvg(size) {
  // Mark height 18 units → scale so height ≈ 90% of size.
  const scale = (0.9 * size) / 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Dictably">
  <g transform="translate(${size / 2} ${size / 2})">
    ${markGroup(scale)}
  </g>
</svg>`;
}

/** Multi-size ICO from PNG buffers (PNG-in-ICO). */
function pngsToIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];
  for (const buf of pngBuffers) {
    entries.push({ buf, offset, size: buf.length });
    offset += buf.length;
  }
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  let entryAt = 6;
  for (const e of entries) {
    const w = e.buf.readUInt32BE(16);
    const h = e.buf.readUInt32BE(20);
    out.writeUInt8(w >= 256 ? 0 : w, entryAt);
    out.writeUInt8(h >= 256 ? 0 : h, entryAt + 1);
    out.writeUInt8(0, entryAt + 2);
    out.writeUInt8(0, entryAt + 3);
    out.writeUInt16LE(1, entryAt + 4);
    out.writeUInt16LE(32, entryAt + 6);
    out.writeUInt32LE(e.size, entryAt + 8);
    out.writeUInt32LE(e.offset, entryAt + 12);
    e.buf.copy(out, e.offset);
    entryAt += 16;
  }
  return out;
}

async function renderPng(page, svg, size) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;width:${size}px;height:${size}px;background:transparent}
svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svg}</body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: "load" });
  return page.screenshot({ type: "png", omitBackground: true });
}

await mkdir(publicDir, { recursive: true });

// S1: brand mark ~62% (scale 20 @ 512); corner ~22% of size.
const sourceSvg = brandSvg({ size: 512, rx: 112, scale: 20 });
await writeFile(path.join(publicDir, "icon.svg"), `${sourceSvg}\n`, "utf8");

const apple = brandSvg({ size: 180, rx: 40, scale: (20 * 180) / 512 });
const pwa192 = brandSvg({ size: 192, rx: 42, scale: (20 * 192) / 512 });
const maskable = maskableSvg({ size: 512, scale: 14 });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

const png16 = await renderPng(page, faviconSvg(16), 16);
const png32 = await renderPng(page, faviconSvg(32), 32);
const png48 = await renderPng(page, faviconSvg(48), 48);
const png180 = await renderPng(page, apple, 180);
const png192 = await renderPng(page, pwa192, 192);
const png512 = await renderPng(page, sourceSvg, 512);
const pngMaskable = await renderPng(page, maskable, 512);

await browser.close();

const ico = pngsToIco([png16, png32, png48]);
await writeFile(path.join(publicDir, "favicon.ico"), ico);
await writeFile(path.join(publicDir, "apple-touch-icon.png"), png180);
await writeFile(path.join(publicDir, "icon-192.png"), png192);
await writeFile(path.join(publicDir, "icon-512.png"), png512);
await writeFile(path.join(publicDir, "icon-maskable-512.png"), pngMaskable);

// S2: only app/favicon.ico — Next injects <link rel="icon"> once.
await copyFile(
  path.join(publicDir, "favicon.ico"),
  path.join(appDir, "favicon.ico"),
);

const manifest = {
  name: "Dictably",
  short_name: "Dictably",
  description: "Meeting minutes you can click to hear.",
  start_url: "/app/",
  scope: "/",
  display: "standalone",
  background_color: CANVAS,
  theme_color: "#0f7b6c",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
await writeFile(
  path.join(publicDir, "manifest.webmanifest"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log("Wrote icons + manifest →", publicDir);
