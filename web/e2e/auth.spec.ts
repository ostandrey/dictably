import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-011");

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
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Sign in",
    );
    await page.locator("[data-auth='dev-login']").click();
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
    await page.locator("[data-auth='dev-login']").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots sign-in 375/768/1440 light+dark", async ({ page }) => {
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    for (const route of [
      { locale: "en" as const, path: "/app/" },
      { locale: "uk" as const, path: "/uk/app/" },
    ]) {
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const vp of VIEWPORTS.filter((v) =>
          ["375", "768", "1440"].includes(v.name),
        )) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(route.path);
          await page.locator("[data-auth='dev-login']").waitFor();
          await page.screenshot({
            path: path.join(
              SHOT_ROOT,
              `${route.locale}-${vp.name}-${scheme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });
});
