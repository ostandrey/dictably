/**
 * Generates public/og.png (1200×630) via Playwright — run after deps install.
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "og.png");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600&family=Onest:wght@500&display=swap');
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    background: #F6F4EF;
    color: #1B1A17;
    font-family: Onest, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 64px 72px;
    box-sizing: border-box;
  }
  .brand {
    font-family: "Source Serif 4", Georgia, serif;
    font-size: 42px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  h1 {
    margin: 0;
    font-family: "Source Serif 4", Georgia, serif;
    font-size: 64px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
    max-width: 14ch;
  }
  .rule {
    height: 1px;
    background: #E2DED5;
    margin: 28px 0;
    width: 120px;
  }
  .sub { color: #6B675F; font-size: 22px; max-width: 28ch; line-height: 1.4; }
</style>
</head>
<body>
  <div>
    <div class="brand">Dictably</div>
    <div class="rule"></div>
    <h1>Meeting minutes you can click to hear.</h1>
  </div>
  <div>
    <p class="sub">Agreements and tasks linked to the exact second.</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "networkidle" });
await mkdir(path.dirname(out), { recursive: true });
const buf = await page.screenshot({ type: "png" });
await writeFile(out, buf);
await browser.close();
console.log("Wrote", out);
