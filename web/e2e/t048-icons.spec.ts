import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOT = path.join("e2e", "__screenshots__", "T-048");

const ICON_PATHS = [
  "/favicon.ico",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
] as const;

test.describe("T-048 icons", () => {
  test("assets resolve + manifest icons", async ({ request }) => {
    for (const p of ICON_PATHS) {
      const res = await request.get(p);
      expect(res.ok(), p).toBeTruthy();
    }
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toBe("Dictably");
    expect(manifest.theme_color).toBe("#0f7b6c");
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest.start_url).toBe("/app/");
    expect(manifest.scope).toBe("/");
    const srcs = (manifest.icons as { src: string; purpose?: string }[]).map(
      (i) => i.src,
    );
    expect(srcs).toContain("/icon-192.png");
    expect(srcs).toContain("/icon-512.png");
    expect(srcs).toContain("/icon-maskable-512.png");
    expect(
      (manifest.icons as { purpose?: string }[]).some(
        (i) => i.purpose === "maskable",
      ),
    ).toBeTruthy();
  });

  for (const route of [
    { locale: "en" as const, path: "/" },
    { locale: "uk" as const, path: "/uk/" },
  ]) {
    test(`${route.locale} head links favicon + apple + manifest (S2 one ico)`, async ({
      page,
    }) => {
      await page.goto(route.path);
      const iconHrefs = await page
        .locator('link[rel="icon"]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLLinkElement).getAttribute("href") ?? ""),
        );
      const icoLinks = iconHrefs.filter((h) => /favicon\.ico/.test(h));
      expect(icoLinks, "exactly one favicon.ico link").toHaveLength(1);
      expect(iconHrefs.some((h) => /icon\.svg/.test(h))).toBeTruthy();

      const apple = page.locator('link[rel="apple-touch-icon"]');
      await expect(apple).toHaveAttribute("href", /apple-touch-icon\.png/);

      const manifest = page.locator('link[rel="manifest"]');
      await expect(manifest).toHaveAttribute("href", /manifest\.webmanifest/);
    });
  }

  test("screenshots: tab + homescreen light/dark + sheet", async ({
    page,
    baseURL,
  }) => {
    fs.mkdirSync(SHOT, { recursive: true });
    const origin = (baseURL ?? "http://127.0.0.1:4173").replace(/\/$/, "");

    await page.setViewportSize({ width: 720, height: 120 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;height:100%;background:#dee1e6;font:13px/1.2 system-ui,sans-serif}
  .bar{display:flex;align-items:flex-end;padding:10px 12px 0;gap:8px;height:100%;box-sizing:border-box}
  .tab{display:flex;align-items:center;gap:8px;background:#fff;border-radius:8px 8px 0 0;
    padding:8px 14px;min-width:180px;box-shadow:0 -1px 0 #c7c7c7}
  .tab img{width:16px;height:16px}
  .tab span{color:#202124;white-space:nowrap}
  .ff{background:#f0f0f4;border:1px solid #cfcfd8;border-radius:6px;padding:6px 12px;
    display:flex;align-items:center;gap:8px}
</style></head><body>
  <div class="bar">
    <div class="tab" data-browser="chrome"><img src="${origin}/favicon.ico" alt=""/><span>Dictably</span></div>
    <div class="ff" data-browser="firefox"><img src="${origin}/icon.svg" width="16" height="16" alt=""/><span>Dictably</span></div>
  </div>
</body></html>`,
      { waitUntil: "networkidle" },
    );
    await page.screenshot({ path: path.join(SHOT, "tab-chrome-firefox.png") });

    async function homescreen(wallpaper: "dark" | "light", file: string) {
      const bg =
        wallpaper === "dark"
          ? "linear-gradient(180deg,#1c1c1e 0%,#2c2c2e 100%)"
          : "linear-gradient(180deg,#d8e4f0 0%,#f2f5f8 55%,#e8efe6 100%)";
      const color = wallpaper === "dark" ? "#fff" : "#1a1b1e";
      const shadow =
        wallpaper === "dark"
          ? "0 1px 2px rgba(0,0,0,.45)"
          : "0 1px 0 rgba(255,255,255,.8)";
      await page.setViewportSize({ width: 390, height: 844 });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;height:100%;background:${bg};
    font:12px/1.2 -apple-system,system-ui,sans-serif;color:${color}}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px 12px;padding:72px 28px 40px;justify-items:center}
  .app{display:flex;flex-direction:column;align-items:center;gap:6px;width:74px}
  .app img{width:60px;height:60px;border-radius:13.5px;display:block;background:#fff}
  .app span{text-align:center;text-shadow:${shadow}}
</style></head><body>
  <div class="grid">
    <div class="app" data-homescreen="dictably" data-wallpaper="${wallpaper}">
      <img src="${origin}/apple-touch-icon.png" alt="Dictably"/>
      <span>Dictably</span>
    </div>
  </div>
</body></html>`,
        { waitUntil: "networkidle" },
      );
      await page.screenshot({ path: path.join(SHOT, file) });
    }

    await homescreen("dark", "homescreen-iphone-dark.png");
    await homescreen("light", "homescreen-iphone-light.png");
    // Keep legacy name pointing at dark (primary compare with Round 1).
    await homescreen("dark", "homescreen-iphone.png");

    await page.setViewportSize({ width: 900, height: 420 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;background:#f7f7f5;font:14px/1.3 system-ui,sans-serif;color:#1a1b1e}
  .row{display:flex;gap:28px;padding:32px;align-items:flex-end;flex-wrap:wrap}
  figure{margin:0;text-align:center}
  figure img{display:block;background:#fff;border:1px solid #e8e8e5}
  figcaption{margin-top:8px;color:#5c5f66;font-size:12px}
  .checker{background:
    linear-gradient(45deg,#e8e8e5 25%,transparent 25%),
    linear-gradient(-45deg,#e8e8e5 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,#e8e8e5 75%),
    linear-gradient(-45deg,transparent 75%,#e8e8e5 75%);
    background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0}
</style></head><body>
  <div class="row">
    <figure><img class="checker" src="${origin}/favicon.ico" width="48" height="48" alt=""/><figcaption>favicon 48</figcaption></figure>
    <figure><img src="${origin}/icon.svg" width="64" height="64" alt=""/><figcaption>icon.svg</figcaption></figure>
    <figure><img src="${origin}/apple-touch-icon.png" width="90" height="90" style="border-radius:20px" alt=""/><figcaption>apple 180</figcaption></figure>
    <figure><img src="${origin}/icon-192.png" width="96" height="96" style="border-radius:21px" alt=""/><figcaption>192 any</figcaption></figure>
    <figure><img src="${origin}/icon-512.png" width="128" height="128" style="border-radius:28px" alt=""/><figcaption>512 any</figcaption></figure>
    <figure><img src="${origin}/icon-maskable-512.png" width="128" height="128" alt=""/><figcaption>512 maskable</figcaption></figure>
  </div>
</body></html>`,
      { waitUntil: "networkidle" },
    );
    await page.screenshot({ path: path.join(SHOT, "icon-sheet.png") });
  });
});
