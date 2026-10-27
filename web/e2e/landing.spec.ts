import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SHOT_ROOT, VIEWPORTS, shot } from "./utils/shots";

const routes = [
  { locale: "en" as const, path: "/", lang: "en" },
  { locale: "uk" as const, path: "/uk/", lang: "uk" },
];

test.describe("T-000a.2 hero motion + sticky", () => {
  for (const route of routes) {
    test(`${route.locale} hero dual-panel + serif headings + free CTA`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route.path);
      await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
      const hero = page.locator('[data-demo-hero="true"]');
      await expect(hero).toBeVisible();
      await expect(hero.locator(".demo__panel--transcript")).toBeVisible();
      await expect(hero.locator(".demo__panel--minutes")).toBeVisible();
      await expect(hero.locator(".demo__wave-svg")).toBeVisible();
      // B1: exactly 3 transcript lines, all visible
      await expect(hero.locator(".demo__line")).toHaveCount(3);
      for (const line of await hero.locator(".demo__line").all()) {
        await expect(line).toBeVisible();
      }
      // B3: minutes visible without JS pending
      await expect(hero.locator(".demo__item").first()).toBeVisible();
      await expect(hero.locator(".demo__item").first()).not.toHaveClass(
        /is-pending/,
      );

      const h1 = page.locator(".hero__title");
      const family = await h1.evaluate(
        (el) => getComputedStyle(el).fontFamily,
      );
      expect(family.toLowerCase()).toMatch(/source serif|serif/);

      const lineText = hero.locator(".demo__line-text").first();
      const lineFamily = await lineText.evaluate(
        (el) => getComputedStyle(el).fontFamily,
      );
      expect(lineFamily.toLowerCase()).toMatch(/onest|sans/);

      const heroCta = page.locator(".hero__cta [data-cta='tally']");
      await expect(heroCta).toBeVisible();
      if (route.locale === "uk") {
        await expect(heroCta).toContainText("безкоштовний протокол", {
          ignoreCase: true,
        });
      } else {
        await expect(heroCta).toContainText("free minutes", {
          ignoreCase: true,
        });
      }
    });

    test(`${route.locale} reduced-motion seek stays in hero`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route.path);
      const hero = page.locator('[data-demo-hero="true"]');
      const beforeY = await page.evaluate(() => window.scrollY);
      await hero.locator(".demo__item .demo__stamp").last().click();
      await expect(hero.locator(".demo__line.is-active")).toBeVisible();
      // S4: seek stays in hero — page must not jump to #example
      const afterY = await page.evaluate(() => window.scrollY);
      expect(Math.abs(afterY - beforeY)).toBeLessThan(40);
      await expect(hero).toBeInViewport({ ratio: 0.3 });
    });

    test(`${route.locale} sticky CTA appears after hero (375)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route.path);
      await page.waitForFunction(() =>
        Boolean(document.querySelector("[data-sticky-cta]")),
      );
      const sticky = page.locator("[data-sticky-cta]");
      await expect(sticky).not.toHaveClass(/is-visible/);
      await page.locator("#how").scrollIntoViewIfNeeded();
      await expect(sticky).toHaveClass(/is-visible/, { timeout: 3000 });
      await expect(sticky.locator("[data-cta='tally']")).toBeVisible();
      await page.locator("[data-final-cta]").scrollIntoViewIfNeeded();
      await expect(sticky).not.toHaveClass(/is-visible/, { timeout: 3000 });
    });

    test(`${route.locale} axe has no serious/critical`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route.path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const bad = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );
      expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
    });
  }

  test("privacy EN page", async ({ page }) => {
    await page.goto("/privacy/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("2026-10-27")).toBeVisible();
  });

  test("privacy UK page", async ({ page }) => {
    await page.goto("/uk/privacy/");
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("2026-10-27")).toBeVisible();
  });

  test("screenshots 320/375/768/1440 light+dark (reduced-motion)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        for (const scheme of ["light", "dark"] as const) {
          await page.emulateMedia({
            colorScheme: scheme,
            reducedMotion: "reduce",
          });
          await page.setViewportSize({
            width: vp.width,
            height: vp.height,
          });
          await page.goto(route.path);
          await page.locator('[data-demo-hero="true"]').waitFor();
          await shot(page, {
            locale: route.locale,
            viewport: vp.name,
            scheme,
          });
        }
      }
    }
  });

  test("reduced-motion still frame screenshot", async ({ page }) => {
    await page.emulateMedia({
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator('[data-demo-hero="true"]').waitFor();
    await shot(page, {
      locale: "en",
      viewport: "1440",
      scheme: "light",
      suffix: "reduced-motion",
    });
  });
});

test.describe("T-000a.2 motion videos", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  const clips: {
    name: string;
    width: number;
    height: number;
  }[] = [
    { name: "en-1440-light", width: 1440, height: 900 },
    { name: "en-375-light", width: 375, height: 812 },
  ];

  for (const clip of clips) {
    test(`record ${clip.name} (≥13s)`, async ({ browser }) => {
      fs.mkdirSync(SHOT_ROOT, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: clip.width, height: clip.height },
        colorScheme: "light",
        reducedMotion: "no-preference",
        recordVideo: {
          dir: SHOT_ROOT,
          size: { width: clip.width, height: clip.height },
        },
      });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/");
      const hero = page.locator('[data-demo-hero="true"]');
      await hero.waitFor();
      await expect
        .poll(async () => hero.getAttribute("data-autoplaying"), {
          timeout: 15_000,
        })
        .toBe("true");
      // Hold through ≥13s of motion (one full cycle + a beat)
      await page.waitForTimeout(13_500);
      await context.close();

      const videos = fs
        .readdirSync(SHOT_ROOT)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => ({
          f,
          m: fs.statSync(path.join(SHOT_ROOT, f)).mtimeMs,
        }))
        .sort((a, b) => b.m - a.m);
      expect(videos.length).toBeGreaterThan(0);
      const newest = path.join(SHOT_ROOT, videos[0].f);
      const dest = path.join(SHOT_ROOT, `${clip.name}.webm`);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(newest, dest);
      // Clean leftover dark videos from prior run naming
      for (const leftover of ["en-1440-dark.webm", "en-375-dark.webm"]) {
        const p = path.join(SHOT_ROOT, leftover);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    });
  }
});
