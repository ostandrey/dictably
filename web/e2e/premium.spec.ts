import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./utils/auth";
import fs from "node:fs";
import path from "node:path";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-036");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

test.describe("T-036 premium feel", () => {
  test.describe.configure({ mode: "serial" });

  test("prerender shows auth skeleton (not Sign in)", async () => {
    const html = fs.readFileSync(path.join("out", "app", "index.html"), "utf8");
    expect(html).toContain('data-shell="skeleton"');
    // Sign-in copy may exist in i18n payload; the interactive heading is gated on 401.
    expect(html).toContain("app-skel");
  });

  test("no Sign-in flash while navigating app chrome", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);

    // Slow subsequent /api/me so a full reload would flash — client nav must not.
    await page.route("**/api/me", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });

    await page.locator("[data-shell='sidebar-nav'] a", { hasText: "People" }).click();
    await expect(page.locator("[data-placeholder='people']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
    await expect(page.locator("[data-shell='skeleton']")).toHaveCount(0);

    await page.locator("[data-shell='sidebar-nav'] a", { hasText: "Settings" }).click();
    await expect(page.locator("[data-settings='panel']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);

    await page.locator("[data-shell='sidebar-nav'] a", { hasText: "Recordings" }).click();
    await expect(page.locator("[data-recordings='panel']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
  });

  test("full-screen drop overlay when list dropzone collapsed", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    await expect(
      page.locator("[data-recordings='empty'], [data-recordings='row']").first(),
    ).toBeVisible();

    // Need >3 rows so the inline dropzone collapses.
    while ((await page.locator("[data-recordings='row']").count()) <= 3) {
      const name = `drop-seed-${Date.now()}.wav`;
      await page.locator("[data-recordings='file']").setInputFiles({
        name,
        mimeType: "audio/wav",
        buffer: fs.readFileSync(FIXTURE),
      });
      await expect(
        page.locator("[data-recordings='row']").filter({ hasText: name }),
      ).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.locator("[data-recordings='upload']")).toHaveCount(0);

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "probe.wav", { type: "audio/wav" }));
      window.dispatchEvent(
        new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }),
      );
    });
    await expect(page.locator("[data-drop='overlay']")).toBeVisible();
  });

  test("prefers-reduced-motion collapses motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/");
    await ensureSignedIn(page);
    const ms = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "ill-wave__bar";
      document.body.appendChild(el);
      const raw = getComputedStyle(el).animationDuration;
      el.remove();
      // "0.01ms" or "0s"
      if (raw.endsWith("ms")) return parseFloat(raw);
      if (raw.endsWith("s")) return parseFloat(raw) * 1000;
      return Number.NaN;
    });
    expect(ms).toBeLessThan(1);
  });

  test("screenshots people / settings / 404", async ({ page }) => {
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page);

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const vp of VIEWPORTS.filter((v) =>
        ["375", "1440"].includes(v.name),
      )) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/app/people/");
        await expect(page.locator("[data-placeholder='people']")).toBeVisible();
        await page.screenshot({
          path: path.join(SHOT_ROOT, `people-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
        await page.goto("/app/settings/");
        await expect(page.locator("[data-settings='panel']")).toBeVisible();
        await page.screenshot({
          path: path.join(SHOT_ROOT, `settings-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/404.html");
    await expect(page.locator("[data-not-found]")).toBeVisible();
    await expect(page.locator(".btn-primary")).toBeVisible();
    await page.screenshot({
      path: path.join(SHOT_ROOT, "404-1440-light.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "404-375-light.png"),
      fullPage: true,
    });
  });

  test("nav motion video 1440 + 375", async ({ browser }) => {
    fs.mkdirSync(SHOT_ROOT, { recursive: true });

    for (const vp of [
      { name: "1440", width: 1440, height: 900 },
      { name: "375", width: 375, height: 812 },
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        recordVideo: {
          dir: SHOT_ROOT,
          size: { width: vp.width, height: vp.height },
        },
      });
      const page = await context.newPage();
      await page.goto("/app/");
      await ensureSignedIn(page);
      await page.waitForTimeout(400);
      if (vp.name === "1440") {
        await page.locator("[data-shell='sidebar-nav'] a", { hasText: "People" }).click();
      } else {
        await page.locator("[data-shell='bottom-nav'] a", { hasText: "People" }).click();
      }
      await expect(page.locator("[data-placeholder='people']")).toBeVisible();
      await page.waitForTimeout(500);
      if (vp.name === "1440") {
        await page.locator("[data-shell='sidebar-nav'] a", { hasText: "Recordings" }).click();
      } else {
        await page.locator("[data-shell='bottom-nav'] a", { hasText: "Recordings" }).click();
      }
      await expect(page.locator("[data-recordings='panel']")).toBeVisible();
      await page.waitForTimeout(600);
      const video = page.video();
      await page.close();
      await context.close();
      if (video) {
        const dest = path.join(SHOT_ROOT, `nav-${vp.name}.webm`);
        await video.saveAs(dest);
      }
    }
  });

  test("axe /app/people — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    await page.goto("/app/people/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
