import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-033");

test.describe("T-033 account / consent / cookies", () => {
  test.describe.configure({ mode: "serial" });

  test("consent then onboarding skip — never again", async ({ page }) => {
    const email = `consent-${Date.now()}@example.com`;
    await page.goto("/app/");
    await page.evaluate(async (em) => {
      await fetch("/api/auth/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, name: "Consent User" }),
      });
    }, email);
    await page.reload();
    await expect(page.locator("[data-consent='accept']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("[data-consent='marketing']")).toBeVisible();
    await page.locator("[data-consent='accept']").click();
    await expect(page.locator("[data-onboarding='skip']")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator("[data-onboarding='skip']").click();
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-consent='accept']")).toHaveCount(0);
    await expect(page.locator("[data-onboarding='skip']")).toHaveCount(0);
  });

  test("settings export + delete account", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    await page.goto("/app/settings/");
    await expect(page.locator("[data-settings='panel']")).toBeVisible();
    await expect(page.locator("[data-settings='export']")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-settings='export']").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/dictably-export-.*\.json/);

    await page.locator("[data-settings='delete']").click();
    await page.locator("[data-settings='delete-confirm']").click();
    await expect(page.locator("[data-auth='dev-login']")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("privacy cookie table EN + UK", async ({ page }) => {
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    for (const route of [
      { locale: "en", path: "/privacy/" },
      { locale: "uk", path: "/uk/privacy/" },
    ]) {
      await page.goto(route.path);
      await expect(page.locator("[data-privacy='cookies']")).toBeVisible();
      await expect(page.getByText("dictably_session")).toBeVisible();
      await expect(page.getByText("dictably_csrf")).toBeVisible();
      await expect(page.getByText("dictably_oauth_state")).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({
        path: path.join(SHOT_ROOT, `privacy-cookies-${route.locale}-1440.png`),
        fullPage: true,
      });
    }
    await page.goto("/terms/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Terms|Умови/,
    );
  });

  test("screenshots consent / onboarding / settings", async ({ page }) => {
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    // Skip motion so screenshots never catch a translucent mid-animation frame (B1).
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    // Fresh user via unique email — use API then land on app.
    await page.goto("/app/");
    await page.evaluate(async () => {
      await fetch("/api/auth/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `shot-${Date.now()}@example.com`,
          name: "Shot User",
        }),
      });
    });
    await page.reload();
    await expect(page.locator("[data-consent='accept']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("[data-dialog='open']")).toBeVisible();
    await expect(page.locator("[data-dialog='open']")).toHaveCSS("opacity", "1");

    for (const vp of VIEWPORTS.filter((v) => ["375", "1440"].includes(v.name))) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
      await page.screenshot({
        path: path.join(SHOT_ROOT, `consent-${vp.name}-light.png`),
        fullPage: true,
      });
    }

    await page.locator("[data-consent='accept']").click();
    await expect(page.locator("[data-onboarding='skip']")).toBeVisible();
    await expect(page.locator("[data-dialog='open']")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "onboarding-1440-light.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "onboarding-375-light.png"),
      fullPage: true,
    });
    await page.locator("[data-onboarding='skip']").click();

    await page.goto("/app/settings/");
    await expect(page.locator("[data-settings='panel']")).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const vp of VIEWPORTS.filter((v) =>
        ["375", "1440"].includes(v.name),
      )) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.screenshot({
          path: path.join(SHOT_ROOT, `settings-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });

  test("axe settings — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    await page.goto("/app/settings/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
