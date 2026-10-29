import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { passAccountGates } from "./utils/auth";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-037");

async function mockAuthConfig(
  page: Page,
  config: { google: boolean; dev_login: boolean },
) {
  await page.route("**/api/auth/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config),
    });
  });
}

async function shotSignIn(
  page: Page,
  file: string,
  opts: {
    path: string;
    width: number;
    height: number;
    scheme: "light" | "dark";
    expectGoogle?: boolean;
    expectDev?: boolean;
  },
) {
  await page.setViewportSize({ width: opts.width, height: opts.height });
  await page.emulateMedia({ colorScheme: opts.scheme, reducedMotion: "reduce" });
  await page.goto(opts.path);
  await expect(page.locator("[data-auth='screen']")).toBeVisible({
    timeout: 15_000,
  });
  if (opts.expectGoogle) {
    await expect(page.locator("[data-auth='google']")).toBeVisible();
  }
  if (opts.expectDev) {
    await expect(page.locator("[data-auth='dev-login']")).toBeVisible();
  }
  if (opts.scheme === "dark") {
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
  } else {
    await page.evaluate(() => {
      document.documentElement.removeAttribute("data-theme");
    });
  }
  await page.screenshot({ path: file, fullPage: true });
}

test.describe("T-037 sign-in screen + signed-out", () => {
  test("anonymous /app/settings/ → sign-in without chrome or account actions", async ({
    page,
  }) => {
    await page.goto("/app/settings/");
    await expect(page.locator("[data-auth='screen']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-auth='card']")).toBeVisible();
    await expect(page.locator("[data-shell='sidebar']")).toHaveCount(0);
    await expect(page.locator("[data-shell='bottom-nav']")).toHaveCount(0);
    await expect(page.locator("[data-settings='delete']")).toHaveCount(0);
    await expect(page.locator("[data-settings='export']")).toHaveCount(0);
    await expect(page.locator("[data-auth='account']")).toHaveCount(0);
  });

  test("Dev login from /app/settings/ returns to settings", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/app/settings/");
    await expect(page.locator("[data-auth='dev-login']")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-auth='dev-login']").click();
    await page.waitForSelector(
      "[data-consent='accept'], [data-settings='panel']",
      { timeout: 15_000 },
    );
    await passAccountGates(page);
    await expect(page).toHaveURL(/\/app\/settings\/?/);
    await expect(page.locator("[data-settings='panel']")).toBeVisible();
    await expect(page.locator("[data-shell='sidebar']")).toBeVisible();
  });

  test("axe sign-in — Google CTA + no serious/critical", async ({ page }) => {
    await mockAuthConfig(page, { google: true, dev_login: false });
    await page.goto("/app/");
    await expect(page.locator("[data-auth='screen']")).toBeVisible();
    await expect(page.locator("[data-auth='google']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots Google CTA 1440/375 light+dark EN/UK", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await mockAuthConfig(page, { google: true, dev_login: false });
    for (const route of [
      { locale: "en", path: "/app/" },
      { locale: "uk", path: "/uk/app/" },
    ] as const) {
      for (const scheme of ["light", "dark"] as const) {
        for (const vp of [
          { name: "375", width: 375, height: 812 },
          { name: "1440", width: 1440, height: 900 },
        ]) {
          await shotSignIn(
            page,
            path.join(
              SHOT_ROOT,
              `signin-google-${route.locale}-${vp.name}-${scheme}.png`,
            ),
            {
              path: route.path,
              width: vp.width,
              height: vp.height,
              scheme,
              expectGoogle: true,
            },
          );
        }
      }
    }
  });

  test("screenshots Dev login 1440/375 light+dark EN/UK", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await mockAuthConfig(page, { google: false, dev_login: true });
    for (const route of [
      { locale: "en", path: "/app/" },
      { locale: "uk", path: "/uk/app/" },
    ] as const) {
      for (const scheme of ["light", "dark"] as const) {
        for (const vp of [
          { name: "375", width: 375, height: 812 },
          { name: "1440", width: 1440, height: 900 },
        ]) {
          await shotSignIn(
            page,
            path.join(
              SHOT_ROOT,
              `signin-dev-${route.locale}-${vp.name}-${scheme}.png`,
            ),
            {
              path: route.path,
              width: vp.width,
              height: vp.height,
              scheme,
              expectDev: true,
            },
          );
        }
      }
    }
  });
});
