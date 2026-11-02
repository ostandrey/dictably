import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, passAccountGates } from "./utils/auth";
import { recordingRow } from "./utils/recordings";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-041");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const CACHE_KEY = "dictably.recordingsList.v2";

function sampleItem(
  id: string,
  opts: Partial<{
    filename: string;
    title: string | null;
    status: string;
    meeting_date: string | null;
    created_at: string;
  }> = {},
) {
  return {
    id,
    filename: opts.filename ?? `file-${id.slice(0, 8)}.wav`,
    title: opts.title === undefined ? `Title ${id.slice(0, 4)}` : opts.title,
    mime: "audio/wav",
    size_bytes: 1_000_000,
    duration_ms: 120_000,
    status: opts.status ?? "ready",
    created_at: opts.created_at ?? "2026-10-28T10:00:00Z",
    meeting_date: opts.meeting_date === undefined ? "2026-10-28" : opts.meeting_date,
    language: "en",
    speaker_count: 2,
    error: null,
    minutes_template: "default",
    transcript_mode: "clean",
  };
}

const SAMPLE_LIST = [
  sampleItem("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    title: "Budget review with Acme",
    filename: "e2e-raw-filename.wav",
  }),
  sampleItem("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
    title: null,
    filename: "waiting-upload.wav",
    status: "uploaded",
    meeting_date: null,
    created_at: "2026-10-28T12:00:00Z",
  }),
  sampleItem("cccccccc-cccc-4ccc-8ccc-cccccccccccc", { title: "Design critique" }),
  sampleItem("dddddddd-dddd-4ddd-8ddd-dddddddddddd", { title: "Sprint planning" }),
  sampleItem("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { title: "Client kickoff" }),
];

async function mockList(page: Page, items = SAMPLE_LIST) {
  await page.unroute("**/api/media**").catch(() => undefined);
  await page.route("**/api/media**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(req.url());
    const pathOnly = url.pathname.replace(/\/$/, "");
    // List only — not /api/media/{id}/…
    if (pathOnly !== "/api/media") {
      await route.continue();
      return;
    }
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const filtered = q
      ? items.filter(
          (it) =>
            (it.title || "").toLowerCase().includes(q) ||
            it.filename.toLowerCase().includes(q),
        )
      : items;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: filtered, next_cursor: null }),
    });
  });
}

async function clearListCache(page: Page) {
  await page.evaluate((key) => {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem("dictably.recordingsList.v1");
  }, CACHE_KEY);
}

async function shot(page: Page, name: string, width: number, dark = false) {
  fs.mkdirSync(SHOT_ROOT, { recursive: true });
  await page.setViewportSize({ width, height: width <= 400 ? 812 : 900 });
  await page.emulateMedia({
    reducedMotion: "reduce",
    colorScheme: dark ? "dark" : "light",
  });
  await page.evaluate((isDark) => {
    if (isDark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }, dark);
  await page.screenshot({
    path: path.join(SHOT_ROOT, `${name}.png`),
    fullPage: true,
  });
}

async function loginFresh(page: Page) {
  await page.goto("/app/");
  await clearListCache(page);
  await ensureSignedIn(page);
}

test.describe("T-041 logic + mobile", () => {
  test.describe.configure({ mode: "serial" });

  test("safe-area: content bottom stays above nav on app pages", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await loginFresh(page);

    for (const href of ["/app/", "/app/people/", "/app/settings/"]) {
      await page.goto(href);
      await page.waitForSelector(
        "[data-recordings='panel'], [data-settings='panel'], [data-placeholder], [data-auth='dev-login'], [data-consent='accept']",
        { timeout: 20_000 },
      );
      if (await page.locator("[data-auth='dev-login']").isVisible()) {
        await ensureSignedIn(page);
      } else if (await page.locator("[data-consent='accept']").isVisible()) {
        await passAccountGates(page);
      }
      const nav = page.locator(".app-bottom-nav");
      await expect(nav).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      const navBox = await nav.boundingBox();
      expect(navBox).toBeTruthy();
      // After scrolling to end, last content must sit above the fixed nav.
      const clear = await page.evaluate(() => {
        const navEl = document.querySelector(".app-bottom-nav");
        const main = document.querySelector(".app-main");
        if (!navEl || !main) return false;
        const navTop = navEl.getBoundingClientRect().top;
        const candidates = main.querySelectorAll(
          "[data-settings='delete'], [data-recordings='choose'], [data-placeholder], .dy-empty__title, .dy-settings__delete-link, .dy-type-title, h1",
        );
        let probe: Element | null = null;
        let maxBottom = -1;
        for (const el of Array.from(candidates)) {
          const b = el.getBoundingClientRect().bottom;
          if (b > maxBottom) {
            maxBottom = b;
            probe = el;
          }
        }
        if (!probe) return false;
        return probe.getBoundingClientRect().bottom <= navTop + 1;
      });
      expect(clear).toBeTruthy();
    }
  });

  test("EN UI dates stay English under uk browser locale", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "uk-UA" });
    const page = await context.newPage();
    await page.setViewportSize({ width: 768, height: 900 });
    await mockList(page);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    await mockList(page);
    await page.reload();
    await ensureSignedIn(page);
    await expect(page.locator("[data-recordings='row']").first()).toBeVisible({
      timeout: 15_000,
    });
    const meta = page.locator("[data-recordings='row'] .dy-rec__meta").first();
    const text = (await meta.innerText()).toLowerCase();
    expect(text).not.toMatch(/жовт|лист|бер/);
    await context.close();
  });

  test("template change without confirm does not start regenerate", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const name = `t041-tpl-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    const details = page.locator("[data-recordings='upload-details']");
    await expect(details).toBeVisible({ timeout: 15_000 });
    await page.locator("[data-recordings='upload-details-continue']").click();
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await row.click();
    await expect(page.locator("[data-minutes='template']")).toBeVisible({
      timeout: 20_000,
    });
    let regenCalls = 0;
    await page.route("**/api/media/*/analysis", async (route) => {
      if (route.request().method() === "POST") regenCalls += 1;
      await route.continue();
    });
    const select = page.locator("[data-minutes='template']");
    const current = await select.inputValue();
    const next = current === "default" ? "official_protocol" : "default";
    await select.selectOption(next);
    await expect(page.locator("[data-minutes='template-confirm']")).toBeVisible();
    expect(regenCalls).toBe(0);
    await page.locator("[data-minutes='template-cancel']").click();
    await expect(select).toHaveValue(current);
    expect(regenCalls).toBe(0);
  });

  test("rename + search-by-title smoke", async ({ page }) => {
    test.setTimeout(60_000);
    await mockList(page);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    await mockList(page);
    await page.reload();
    await ensureSignedIn(page);
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: "Budget review with Acme" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.locator("[data-recordings='search']").fill("Budget review");
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: "Budget review with Acme" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: "waiting-upload" }),
    ).toHaveCount(0);
  });

  test("B1 user title survives regenerate", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const name = `t041-b1-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-recordings='upload-details']")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-recordings='upload-details-continue']").click();
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("[data-recording='more']").click();
    await page.locator("[data-recording='rename-title']").click();
    const titleInput = page.locator("[data-recording='title-input']");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("My budget Q4");
    await page.locator("[data-recording='title-save']").click();
    await expect(page.locator("[data-recording='page'] h1")).toContainText(
      "My budget Q4",
      { timeout: 10_000 },
    );
    await page.locator("[data-recording='more']").click();
    await page.locator("[data-minutes='regenerate-menu']").click();
    await expect(page.locator("[data-minutes='regenerate']").last()).toBeVisible();
    await page.locator("[data-minutes='regenerate']").last().click();
    await expect(page.locator("[data-recording='page'] h1")).toContainText(
      "My budget Q4",
      { timeout: 60_000 },
    );
  });

  test("B6 app-main at 767/768/769 — not below the fold", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const name = `t041-b6-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-recordings='upload-details']")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-recordings='upload-details-continue']").click();
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });

    for (const width of [767, 768, 769] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/");
      await clearListCache(page);
      await ensureSignedIn(page);
      await expect(page.locator("[data-recordings='panel']")).toBeVisible({
        timeout: 15_000,
      });
      const listGeom = await page.evaluate(() => {
        const main = document.querySelector(".app-main");
        const side = document.querySelector(".app-sidebar");
        if (!main) return null;
        const m = main.getBoundingClientRect();
        const s = side?.getBoundingClientRect();
        return {
          mainY: m.top,
          mainX: m.left,
          sideVisible: Boolean(s && s.height > 0 && getComputedStyle(side!).display !== "none"),
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });
      expect(listGeom, `list @${width}`).toBeTruthy();
      expect(listGeom!.mainY, `list main.y @${width}`).toBeLessThanOrEqual(1);
      expect(listGeom!.scrollW).toBeLessThanOrEqual(listGeom!.clientW + 1);
      if (width >= 768) {
        expect(listGeom!.sideVisible, `sidebar @${width}`).toBe(true);
        expect(listGeom!.mainX, `list main.x @${width}`).toBeGreaterThanOrEqual(239);
      } else {
        expect(listGeom!.sideVisible, `sidebar hidden @${width}`).toBe(false);
        expect(listGeom!.mainX, `list main.x @${width}`).toBeLessThan(16.5);
      }

      await recordingRow(page, name).click();
      await expect(page.locator("[data-recording='page']")).toBeVisible({
        timeout: 20_000,
      });
      const recGeom = await page.evaluate(() => {
        const main = document.querySelector(".app-main");
        if (!main) return null;
        const m = main.getBoundingClientRect();
        return {
          mainY: m.top,
          mainX: m.left,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });
      expect(recGeom, `rec @${width}`).toBeTruthy();
      expect(recGeom!.mainY, `rec main.y @${width}`).toBeLessThanOrEqual(1);
      expect(recGeom!.scrollW).toBeLessThanOrEqual(recGeom!.clientW + 1);
      if (width >= 768) {
        expect(recGeom!.mainX, `rec main.x @${width}`).toBeGreaterThanOrEqual(239);
      }
      await page.goto("/app/");
    }
  });

  test("S9 recording page reaches app-main right edge at 1440", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const name = `t041-s9-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-recordings='upload-details']")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-recordings='upload-details-continue']").click();
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 20_000,
    });
    const gap = await page.evaluate(() => {
      const main = document.querySelector(".app-main");
      const rec = document.querySelector("[data-recording='page']");
      const hero = document.querySelector(".rec-page__hero");
      if (!main || !rec || !hero) return 999;
      const mr = main.getBoundingClientRect().right;
      return Math.max(
        mr - rec.getBoundingClientRect().right,
        mr - hero.getBoundingClientRect().right,
      );
    });
    expect(gap).toBeLessThanOrEqual(1);
  });

  test("B2/B3 recording page inset + reading space at 375", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const name = `t041-b2-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-recordings='upload-details']")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-recordings='upload-details-continue']").click();
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("[data-recording='tab-minutes']").click();
    const metrics = await page.evaluate(() => {
      const pageEl = document.querySelector("[data-recording='page']");
      const tabs = document.querySelector(".rec-page__tabs");
      const minutes = document.querySelector("[data-recording='minutes']");
      const player = document.querySelector("[data-recording='player']");
      const nav = document.querySelector("[data-shell='bottom-nav']");
      const firstHeading =
        minutes?.querySelector("h2, h3, [data-minutes='item']") ?? null;
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        page: box(pageEl),
        tabs: box(tabs),
        minutes: box(minutes),
        firstHeading: box(firstHeading),
        player: box(player),
        nav: box(nav),
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.tabs!.left).toBeGreaterThanOrEqual(15.5);
    expect(metrics.tabs!.right).toBeLessThanOrEqual(359.5);
    expect(metrics.minutes!.left).toBeGreaterThanOrEqual(15.5);
    expect(metrics.firstHeading!.top).toBeLessThanOrEqual(280);
    // Fixed player + bottom nav must not cover the first minutes item
    if (metrics.player && metrics.firstHeading) {
      expect(metrics.firstHeading.bottom).toBeLessThanOrEqual(
        metrics.player.top + 1,
      );
    }
    if (metrics.nav && metrics.player) {
      const fixedH = metrics.nav.bottom - metrics.player.top;
      expect(fixedH).toBeLessThanOrEqual(125);
    }
  });

  test("screenshots list / settings / sheets", async ({ page }) => {
    test.setTimeout(180_000);
    await mockList(page);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);

    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      for (const width of [375, 768, 1440]) {
        await mockList(page);
        await page.goto("/app/");
        await clearListCache(page);
        await ensureSignedIn(page);
        await mockList(page);
        await page.reload();
        await expect(page.locator("[data-recordings='row']").first()).toBeVisible({
          timeout: 15_000,
        });
        await shot(page, `list-${width}-${theme}`, width, dark);

        await page.goto("/app/settings/");
        await expect(page.locator("[data-settings='panel']")).toBeVisible({
          timeout: 15_000,
        });
        await shot(page, `settings-${width}-${theme}`, width, dark);
      }
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await mockList(page);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    await mockList(page);
    await page.reload();
    const ready = page
      .locator("[data-recordings='row']")
      .filter({ hasText: "Budget review with Acme" });
    await expect(ready).toBeVisible({ timeout: 15_000 });
    await ready.locator("[data-recordings='menu']").click();
    await expect(page.locator("[data-sheet='panel']")).toBeVisible();
    await shot(page, "row-sheet-375-light", 375, false);
    await page.locator("[data-sheet='close']").click();

    await page.locator("[data-recordings='file']").setInputFiles({
      name: `t041-${Date.now()}.wav`,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-sheet='panel']")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "upload-sheet-375-light", 375, false);
    await page.locator("[data-sheet='close']").click();

    // Recording page — upload one ready file, then both tabs + share sheet
    const recName = `t041-rec-${Date.now()}.wav`;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    await page.locator("[data-recordings='file']").setInputFiles({
      name: recName,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-recordings='upload-details']")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-recordings='upload-details-continue']").click();
    const recRow = recordingRow(page, recName);
    await expect(recRow).toBeVisible({ timeout: 30_000 });
    await expect(recRow).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await recRow.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 20_000,
    });
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      for (const width of [375, 768, 1440]) {
        if (width <= 400) {
          await page.setViewportSize({ width, height: 812 });
          await page.locator("[data-recording='tab-minutes']").click();
          await shot(page, `recording-minutes-${width}-${theme}`, width, dark);
          await page.locator("[data-recording='tab-transcript']").click();
          await shot(page, `recording-transcript-${width}-${theme}`, width, dark);
        } else {
          await shot(page, `recording-${width}-${theme}`, width, dark);
        }
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.locator("[data-recording='share']").click();
    await expect(page.locator("[data-recording='share-sheet']")).toBeVisible();
    await shot(page, "share-sheet-375-light", 375, false);
  });
});
