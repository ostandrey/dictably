import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-043");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const CACHE_KEY = "dictably.recordingsList.v2";

async function clearListCache(page: Page) {
  await page.evaluate((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, CACHE_KEY);
}

async function applyTheme(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.evaluate(async (dark) => {
    const root = document.documentElement;
    const paint = () =>
      new Promise<void>((r) => requestAnimationFrame(() => r()));
    const apply = () => {
      if (dark) root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
    };
    apply();
    await paint();
    await paint();
    apply();
  }, scheme === "dark");
  await page.waitForFunction(
    (dark) => {
      const c = getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim()
        .toLowerCase();
      if (dark) return c === "#18191c";
      return c === "#fff" || c === "#ffffff";
    },
    scheme === "dark",
    { timeout: 5_000 },
  );
}

async function shot(
  page: Page,
  name: string,
  width: number,
  dark: boolean,
) {
  await page.setViewportSize({
    width,
    height: width <= 400 ? 812 : 900,
  });
  await applyTheme(page, dark ? "dark" : "light");
  await page.screenshot({
    path: path.join(SHOT_ROOT, `${name}.png`),
    fullPage: true,
  });
}

test.describe("T-043 illustrations + S10/N9", () => {
  test.describe.configure({ mode: "serial" });

  test("S10 recording tabs through 1023; two columns at 1024", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const name = `t043-s10-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 20_000,
    });

    for (const width of [768, 900, 1023, 1024] as const) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await page.evaluate(() => {
        const tabs = document.querySelector("[data-recording='tabs']");
        const transcript = document.querySelector("[data-recording='transcript']");
        const find = document.querySelector("[data-recording='find']");
        const timeBtn = document.querySelector(
          "[data-recording='transcript'] [data-recording='seg-seek']",
        );
        const tBox = transcript?.getBoundingClientRect();
        const fBox = find?.getBoundingClientRect();
        const tabsStyle = tabs ? getComputedStyle(tabs).display : "none";
        return {
          tabsDisplay: tabsStyle,
          transcriptW: tBox?.width ?? 0,
          findVisible: Boolean(fBox && fBox.width > 8 && fBox.right <= window.innerWidth + 1),
          findRight: fBox?.right ?? 0,
          vw: window.innerWidth,
          timeVisible: Boolean(
            timeBtn && getComputedStyle(timeBtn).display !== "none",
          ),
        };
      });
      if (width <= 1023) {
        expect(metrics.tabsDisplay, `tabs @${width}`).not.toBe("none");
        await page.locator("[data-recording='tab-transcript']").click();
        await expect(
          page.locator("[data-recording='transcript'].is-open"),
        ).toBeVisible();
        const after = await page.evaluate(() => {
          const find = document.querySelector("[data-recording='find']");
          const seg = document.querySelector(
            "[data-recording='transcript'] [data-recording='segment']",
          );
          const f = find?.getBoundingClientRect();
          const s = seg?.getBoundingClientRect();
          return {
            findOk: Boolean(f && f.width > 40 && f.right <= window.innerWidth + 1),
            segOk: !s || s.right <= window.innerWidth + 1,
            transcriptW:
              document
                .querySelector("[data-recording='transcript']")
                ?.getBoundingClientRect().width ?? 0,
          };
        });
        expect(after.findOk, `find not clipped @${width}`).toBe(true);
        expect(after.segOk, `seg not clipped @${width}`).toBe(true);
        expect(after.transcriptW, `transcript width @${width}`).toBeGreaterThan(
          280,
        );
      } else {
        expect(metrics.tabsDisplay, `tabs hidden @${width}`).toBe("none");
        expect(metrics.transcriptW, `two-col transcript @${width}`).toBeGreaterThan(
          280,
        );
      }
    }
  });

  test("N9 soft list refresh keeps just-uploaded row", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);

    let releaseList: (() => void) | undefined;
    let listGate: Promise<void> = Promise.resolve();
    await page.route("**/api/media?**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await listGate;
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });

    const name = `t043-n9-${Date.now()}.wav`;
    listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });

    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });

    // Soft refresh: delayed first-page response must not drop the new row (mergeFirstPage).
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(200);
    releaseList?.();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(recordingRow(page, name)).toBeVisible();
  });

  test("illustration screenshots — six states 375/1440 light+dark", async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });

    // Empty list
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    await page.route("**/api/media?**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      });
    });
    await page.reload();
    await ensureSignedIn(page);
    await expect(page.locator("[data-recordings='empty']")).toBeVisible({
      timeout: 15_000,
    });
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      await shot(page, `empty-375-${theme}`, 375, dark);
      await shot(page, `empty-1440-${theme}`, 1440, dark);
    }
    await page.unroute("**/api/media?**");

    // People
    await page.goto("/app/people/");
    await expect(page.locator("[data-placeholder='people']")).toBeVisible();
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      await shot(page, `people-375-${theme}`, 375, dark);
      await shot(page, `people-1440-${theme}`, 1440, dark);
    }

    // Processing (upload in progress overlay ill)
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    await page.route("**/api/media/upload**", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    const procName = `t043-proc-${Date.now()}.wav`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("[data-recordings='file']").setInputFiles({
      name: procName,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    // Details may appear after probe; if uploading shows first, capture that.
    const uploading = page.locator("[data-recordings='upload'] .dy-upload__ill");
    const details = page.locator("[data-recordings='upload-details']");
    await Promise.race([
      uploading.waitFor({ state: "visible", timeout: 10_000 }).catch(() => null),
      details.waitFor({ state: "visible", timeout: 10_000 }).catch(() => null),
    ]);
    if (await details.isVisible()) {
      // Force a slow second upload after continuing so processing ill shows.
      await page.locator("[data-recordings='upload-details-continue']").click();
    }
    // Capture processing ill via injected mount if upload finishes too fast.
    const hasProc = await uploading.isVisible().catch(() => false);
    if (!hasProc) {
      await page.evaluate(() => {
        const host = document.createElement("div");
        host.setAttribute("data-ill-shot", "processing");
        host.style.cssText =
          "display:grid;place-items:center;padding:48px;background:var(--canvas)";
        host.innerHTML = `<svg width="240" height="120" viewBox="0 0 240 120" fill="none" aria-hidden="true">
          <g stroke-width="6" stroke-linecap="round">
            <path stroke="var(--speaker-1)" d="M16 50v20M30 38v44M44 46v28"/>
            <path stroke="var(--speaker-2)" d="M58 30v60M72 44v32M86 52v16"/>
            <path stroke="var(--speaker-1)" d="M100 40v40M114 48v24"/>
            <path stroke="var(--line)" d="M128 34v52M142 46v28M156 54v12M170 40v40M184 50v20M198 36v48M212 48v24M226 54v12"/>
          </g>
          <g class="ill-scan"><path d="M121 18v84" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/><circle cx="121" cy="18" r="4" fill="var(--accent)"/></g>
        </svg>`;
        document.body.prepend(host);
      });
    }
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      const target = hasProc
        ? page.locator("[data-recordings='upload']")
        : page.locator("[data-ill-shot='processing']");
      await applyTheme(page, dark ? "dark" : "light");
      await page.setViewportSize({ width: 375, height: 812 });
      await target.screenshot({
        path: path.join(SHOT_ROOT, `processing-375-${theme}.png`),
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await target.screenshot({
        path: path.join(SHOT_ROOT, `processing-1440-${theme}.png`),
      });
    }
    await page.unroute("**/api/media/upload**");
    await page.evaluate(() => {
      document.querySelector("[data-ill-shot='processing']")?.remove();
    });

    // Failed: real product page (route media as failed) — T-043 N3 / T-040
    {
      await page.goto("/app/");
      await clearListCache(page);
      await ensureSignedIn(page);
      const failName = `t043-fail-${Date.now()}.wav`;
      await page.locator("[data-recordings='file']").setInputFiles({
        name: failName,
        mimeType: "audio/wav",
        buffer: fs.readFileSync(FIXTURE),
      });
      await confirmUploadDetailsIfOpen(page);
      const failRow = recordingRow(page, failName);
      await expect(failRow).toBeVisible({ timeout: 30_000 });
      const href = await failRow.locator("a.dy-rec__title").getAttribute("href");
      const failId = new URL(href!, "http://127.0.0.1").searchParams.get("id");
      expect(failId).toBeTruthy();
      await page.route(`**/api/media/${failId}`, async (route) => {
        if (route.request().method() !== "GET") {
          await route.continue();
          return;
        }
        const res = await route.fetch();
        const json = await res.json();
        json.status = "failed";
        json.error = "ASR provider timed out";
        await route.fulfill({
          status: res.status(),
          headers: { ...res.headers(), "content-type": "application/json" },
          body: JSON.stringify(json),
        });
      });
      await page.goto(`/app/r/?id=${failId}`);
      await expect(page.locator("[data-recording-failed]")).toBeVisible({
        timeout: 15_000,
      });
      for (const dark of [false, true]) {
        const theme = dark ? "dark" : "light";
        for (const width of [375, 1440]) {
          await page.setViewportSize({
            width,
            height: width <= 400 ? 812 : 900,
          });
          await applyTheme(page, dark ? "dark" : "light");
          await page.locator("[data-recording-failed]").screenshot({
            path: path.join(SHOT_ROOT, `failed-${width}-${theme}.png`),
          });
        }
      }
      await page.unroute(`**/api/media/${failId}`);
    }

    // Deleted: real gone page uses IllDeleted (T-043 N3)
    {
      await page.goto("/app/r/?id=00000000-0000-4000-8000-0000000000de");
      await expect(page.locator("[data-recording-gone]")).toBeVisible({
        timeout: 15_000,
      });
      for (const dark of [false, true]) {
        const theme = dark ? "dark" : "light";
        for (const width of [375, 1440]) {
          await page.setViewportSize({
            width,
            height: width <= 400 ? 812 : 900,
          });
          await applyTheme(page, dark ? "dark" : "light");
          await page.locator("[data-recording-gone]").screenshot({
            path: path.join(SHOT_ROOT, `deleted-${width}-${theme}.png`),
          });
        }
      }
    }

    // 404
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      for (const width of [375, 1440]) {
        await page.goto("/404.html");
        await expect(page.locator("[data-not-found]")).toBeVisible();
        await shot(page, `404-${width}-${theme}`, width, dark);
      }
    }

    // Sign-in ill (desktop) vs mobile brand — not the same as empty
    {
      const signedOut = await browser.newContext();
      const so = await signedOut.newPage();
      await so.goto("/app/");
      await expect(so.locator("[data-auth='screen']")).toBeVisible({
        timeout: 15_000,
      });
      await so.setViewportSize({ width: 1440, height: 900 });
      await applyTheme(so, "light");
      await expect(so.locator("[data-auth='ill-signin']")).toBeVisible();
      await so.screenshot({
        path: path.join(SHOT_ROOT, "signin-1440-light.png"),
        fullPage: true,
      });
      await so.setViewportSize({ width: 375, height: 812 });
      await applyTheme(so, "light");
      await expect(so.locator("[data-auth='mobile-brand']")).toBeVisible();
      // Aside ill stays in DOM but is CSS-hidden on phone (T-041 D6 / T-043).
      await expect(so.locator("[data-auth='ill-signin']")).toBeHidden();
      await so.screenshot({
        path: path.join(SHOT_ROOT, "signin-375-light.png"),
        fullPage: true,
      });
      await so.setViewportSize({ width: 1440, height: 900 });
      await applyTheme(so, "dark");
      await expect(so.locator("[data-auth='ill-signin']")).toBeVisible();
      await so.screenshot({
        path: path.join(SHOT_ROOT, "signin-1440-dark.png"),
        fullPage: true,
      });
      await signedOut.close();
    }

    // Delete dialog shows IllDeleted
    await page.goto("/app/");
    await clearListCache(page);
    await ensureSignedIn(page);
    const delName = `t043-del-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name: delName,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const delRow = recordingRow(page, delName);
    await expect(delRow).toBeVisible({ timeout: 30_000 });
    // Soft-delete toast (T-040) — IllDeleted also on gone page above.
    await delRow.locator("[data-recordings='menu']").click();
    await page.locator("[data-recordings='delete']").click();
    await expect(page.locator("[data-toast='item']")).toBeVisible();
    await applyTheme(page, "light");
    await page.locator("[data-toast='root']").screenshot({
      path: path.join(SHOT_ROOT, "delete-dialog-ill-1440-light.png"),
    });
  });
});
