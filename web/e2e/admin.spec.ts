import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { passAccountGates } from "./utils/auth";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-019");
const backendRoot = path.resolve(process.cwd(), "..", "backend");
const ADMIN_EMAIL = "admin-en@example.com";

function setRole(email: string, role: "admin" | "user") {
  const cmd = role === "admin" ? "set-admin" : "set-user";
  // Must match Playwright API webServer ENV=test → same DB as the app under test.
  execFileSync("uv", ["run", "python", "-m", "dictably.cli", cmd, email], {
    cwd: backendRoot,
    stdio: "pipe",
    shell: true,
    env: {
      ...process.env,
      ENV: "test",
      DEV_LOGIN: "1",
      COOKIE_SECURE: "0",
    },
  });
}

test.describe("T-019 admin", () => {
  test("non-admin forbidden; after CLI promote → panel", async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Admin",
    );
    await page.locator("[data-auth='dev-login']").click();
    await page.waitForSelector(
      "[data-consent='accept'], [data-admin='forbidden'], [data-admin='panel']",
      { timeout: 15_000 },
    );
    await passAccountGates(page);
    await page
      .locator("[data-admin='forbidden'], [data-admin='panel']")
      .first()
      .waitFor({ timeout: 15_000 });

    setRole(ADMIN_EMAIL, "user");
    await page.reload();
    await expect(page.locator("[data-admin='forbidden']")).toBeVisible({
      timeout: 15_000,
    });

    setRole(ADMIN_EMAIL, "admin");
    await page.reload();
    await expect(page.locator("[data-admin='panel']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-admin='users']")).toBeVisible();
    await expect(page.locator("[data-shell='sidebar-nav'] [data-nav='admin']")).toBeVisible();

    await page.locator("[data-admin='tab-jobs']").click();
    await expect(page.locator("[data-admin='filter-failed']")).toBeVisible();

    await page.locator("[data-admin='tab-costs']").click();
    await expect(page.locator("[data-admin='costs']")).toBeVisible();
  });

  test("API /admin/users is 404 for non-admin session", async ({ page }) => {
    await page.goto("/app/");
    await page.locator("[data-auth='dev-login']").click();
    await page.waitForSelector(
      "[data-consent='accept'], [data-recordings='panel']",
      { timeout: 15_000 },
    );
    await passAccountGates(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    const res = await page.request.get("/api/admin/users");
    expect(res.status()).toBe(404);
  });

  test("axe on /admin/ sign-in — no serious/critical", async ({ page }) => {
    await page.goto("/admin/");
    await page.locator("[data-auth='dev-login']").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots admin panel 375/768/1440 light+dark", async ({ page }) => {
    await page.goto("/admin/");
    await page.locator("[data-auth='dev-login']").click();
    await page.waitForSelector(
      "[data-consent='accept'], [data-admin='forbidden'], [data-admin='panel']",
      { timeout: 15_000 },
    );
    await passAccountGates(page);
    await page
      .locator("[data-admin='forbidden'], [data-admin='panel']")
      .first()
      .waitFor({ timeout: 15_000 });
    setRole(ADMIN_EMAIL, "admin");
    await page.goto("/admin/");
    await expect(page.locator("[data-admin='panel']")).toBeVisible({
      timeout: 15_000,
    });

    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const vp of VIEWPORTS.filter((v) =>
        ["375", "768", "1440"].includes(v.name),
      )) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/admin/");
        await expect(page.locator("[data-admin='panel']")).toBeVisible({
          timeout: 15_000,
        });
        await page.screenshot({
          path: path.join(SHOT_ROOT, `en-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
