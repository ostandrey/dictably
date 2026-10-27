import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { VIEWPORTS, shot } from "./utils/shots";

const routes = [
  { locale: "en" as const, path: "/", lang: "en" },
  { locale: "uk" as const, path: "/uk/", lang: "uk" },
];

test.describe("T-000a landing", () => {
  for (const route of routes) {
    test(`${route.locale} renders hero + interactive demo`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
      await expect(page.getByRole("banner").getByText("Dictably")).toBeVisible();
      await expect(page.locator("[data-demo]").first()).toBeVisible();
      await expect(page.locator(".brand--hero")).toHaveCount(0);

      const stamp = page.locator(".demo__stamp").first();
      await stamp.click();
      await expect(page.locator(".demo__line.is-active").first()).toBeVisible();
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

  test("privacy pages exist", async ({ page }) => {
    await page.goto("/privacy/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Privacy",
    );
    await page.goto("/uk/privacy/");
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Конфіденційність",
    );
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
