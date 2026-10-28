import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-003");

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

  test("axe on /app/ — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots app shells 375/768/1440", async ({ page }) => {
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    for (const route of [
      { locale: "en" as const, path: "/app/" },
      { locale: "uk" as const, path: "/uk/app/" },
    ]) {
      for (const vp of VIEWPORTS.filter((v) =>
        ["375", "768", "1440"].includes(v.name),
      )) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route.path);
        await page.getByRole("heading", { level: 1 }).waitFor();
        await page.screenshot({
          path: path.join(SHOT_ROOT, `${route.locale}-${vp.name}-light.png`),
          fullPage: true,
        });
      }
    }
  });
});
