import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { passAccountGates } from "./utils/auth";

test.describe("T-011 auth", () => {
  test("auth_error query shows localized message (whitelist)", async ({
    page,
  }) => {
    await page.goto("/app/?auth_error=access_denied");
    await expect(page.locator("[data-auth='error']")).toContainText(
      "Sign-in was cancelled",
    );
    await page.goto("/app/?auth_error=<script>alert(1)</script>");
    await expect(page.locator("[data-auth='error']")).toHaveCount(0);
  });

  test("Dev login → me → logout; /api/media 401 then 200", async ({
    page,
    request,
  }) => {
    const anon = await request.get("/api/media");
    expect(anon.status()).toBe(401);

    await page.goto("/app/");
    await expect(page.locator("[data-auth='screen']")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Sign in|Увійти/,
    );
    await page.locator("[data-auth='dev-login']").click();
    await page.waitForSelector(
      "[data-consent='accept'], [data-recordings='panel']",
      { timeout: 15_000 },
    );
    await passAccountGates(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible();
    await expect(page.locator("[data-auth='logout']")).toBeVisible();
    await expect(page.locator("[data-auth='account']")).toBeVisible();

    const media = await page.request.get("/api/media");
    expect(media.status()).toBe(200);

    await page.locator("[data-auth='logout']").click();
    await expect(page.locator("[data-auth='dev-login']")).toBeVisible({
      timeout: 15_000,
    });

    const after = await page.request.get("/api/media");
    expect(after.status()).toBe(401);
  });

  test("axe on /app/ — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.locator("[data-auth='screen']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
