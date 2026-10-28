import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { VIEWPORTS, shot } from "./utils/shots";

const routes = [
  { locale: "en" as const, path: "/", lang: "en" },
  { locale: "uk" as const, path: "/uk/", lang: "uk" },
];

test.describe("T-004 landing", () => {
  for (const route of routes) {
    test(`${route.locale} hero signature + Onest + upload CTA`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route.path);
      await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
      await expect(page.locator("[data-hero-signature]")).toBeVisible();
      await expect(page.locator('[data-demo-hero="true"]')).toBeVisible();

      const h1 = page.locator(".hero__title");
      const family = await h1.evaluate(
        (el) => getComputedStyle(el).fontFamily,
      );
      expect(family.toLowerCase()).toMatch(/onest|sans/);

      const heroCta = page.locator(".hero__cta [data-cta='app']");
      await expect(heroCta).toBeVisible();
      const appHref = route.locale === "uk" ? "/uk/app/" : "/app/";
      await expect(heroCta).toHaveAttribute("href", appHref);
      if (route.locale === "uk") {
        await expect(heroCta).toContainText("Завантажити", { ignoreCase: true });
      } else {
        await expect(heroCta).toContainText("Upload a recording", {
          ignoreCase: true,
        });
      }
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
      await expect(sticky.locator("[data-cta='app']")).toBeVisible();
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
    await expect(page.getByText("2026-10-28")).toBeVisible();
  });

  test("privacy UK page", async ({ page }) => {
    await page.goto("/uk/privacy/");
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("2026-10-28")).toBeVisible();
  });

  test("screenshots 375/768/1440 light (teal)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    for (const route of routes) {
      for (const vp of VIEWPORTS.filter((v) =>
        ["375", "768", "1440"].includes(v.name),
      )) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route.path);
        await page.locator("[data-hero-signature]").waitFor();
        await shot(page, {
          locale: route.locale,
          viewport: vp.name,
          scheme: "light",
        });
      }
    }
  });
});

test.describe("T-004 theme screenshots", () => {
  test("teal-light / tomato-light / teal-dark @ 375/768/1440", async ({
    page,
  }) => {
    const dir = path.join(process.cwd(), "e2e", "__screenshots__", "T-004");
    fs.mkdirSync(dir, { recursive: true });

    const themes: { name: string; accent: string; theme?: string }[] = [
      { name: "teal-light", accent: "teal" },
      { name: "tomato-light", accent: "tomato" },
      { name: "teal-dark", accent: "teal", theme: "dark" },
    ];
    const sizes = [
      { name: "375", width: 375, height: 812 },
      { name: "768", width: 768, height: 1024 },
      { name: "1440", width: 1440, height: 900 },
    ];

    for (const theme of themes) {
      for (const vp of sizes) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({
          reducedMotion: "reduce",
          colorScheme: theme.theme === "dark" ? "dark" : "light",
        });
        await page.goto("/");
        await page.evaluate(
          ({ accent, dark }) => {
            const root = document.documentElement;
            root.setAttribute("data-accent", accent);
            if (dark) root.setAttribute("data-theme", "dark");
            else root.removeAttribute("data-theme");
          },
          { accent: theme.accent, dark: theme.theme === "dark" },
        );
        await page.locator("[data-hero-signature]").waitFor();
        await page.screenshot({
          path: path.join(dir, `${theme.name}-${vp.name}.png`),
          fullPage: true,
        });
      }
    }
  });
});
