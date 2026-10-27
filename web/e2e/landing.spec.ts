import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { VIEWPORTS, shot } from "./utils/shots";

const routes = [
  { locale: "en" as const, path: "/", lang: "en" },
  { locale: "uk" as const, path: "/uk/", lang: "uk" },
];

test.describe("T-000a.1 landing follow-up", () => {
  for (const route of routes) {
    test(`${route.locale} renders hero + serif + free CTA`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
      await expect(page.getByRole("banner").getByText("Dictably")).toBeVisible();
      await expect(page.locator("[data-demo]").first()).toBeVisible();

      const h1 = page.locator(".hero__title");
      await expect(h1).toBeVisible();
      const family = await h1.evaluate(
        (el) => getComputedStyle(el).fontFamily,
      );
      expect(family.toLowerCase()).toMatch(/source serif|serif/);

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

    test(`${route.locale} compact timestamp scrolls to #example`, async ({
      page,
    }) => {
      await page.goto(route.path);
      const compact = page.locator("[data-demo-compact='true']");
      await compact.locator(".demo__stamp").first().click();
      await expect(page.locator("#example")).toBeInViewport({ ratio: 0.2 });
      await expect(
        page.locator("#example .demo__line.is-active").first(),
      ).toBeVisible({ timeout: 3000 });
    });

    test(`${route.locale} axe has no serious/critical`, async ({ page }) => {
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

  test("privacy date is fixed", async ({ page }) => {
    await page.goto("/privacy/");
    await expect(page.getByText("2026-10-27")).toBeVisible();
  });

  test("screenshots 375/768/1440 light+dark", async ({ page }) => {
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        for (const scheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({
            width: vp.width,
            height: vp.height,
          });
          await page.goto(route.path);
          await page.locator("[data-demo]").first().waitFor();
          await shot(page, {
            locale: route.locale,
            viewport: vp.name,
            scheme,
          });
        }
      }
    }
  });
});
