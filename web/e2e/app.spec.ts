import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const appRoutes = [
  { locale: "en" as const, path: "/app/", heading: "Sign in" },
  { locale: "uk" as const, path: "/uk/app/", heading: "Вхід" },
  { locale: "en" as const, path: "/admin/", heading: "Admin" },
  { locale: "uk" as const, path: "/uk/admin/", heading: "Адмінка" },
];

test.describe("T-003 app / admin skeleton", () => {
  for (const route of appRoutes) {
    test(`${route.path} opens`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        route.heading,
      );
    });
  }

  test("landing CTA navigates to /app/", async ({ page }) => {
    await page.goto("/");
    await page.locator(".hero__cta [data-cta='app']").click();
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Sign in",
    );
  });

  test("axe on /admin/ — no serious/critical", async ({ page }) => {
    await page.goto("/admin/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
