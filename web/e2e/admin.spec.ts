import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { passAccountGates, uniqueE2eEmail } from "./utils/auth";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-019");
const backendRoot = path.resolve(process.cwd(), "..", "backend");

function setRole(email: string, role: "admin" | "user") {
  const cmd = role === "admin" ? "set-admin" : "set-user";
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

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.evaluate(
    async ({ em }) => {
      await fetch("/api/auth/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, name: "Admin E2E" }),
      });
    },
    { em: email },
  );
  await page.reload();
  await page.waitForSelector(
    "[data-consent='accept'], [data-admin='forbidden'], [data-admin='panel'], [data-recordings='panel'], [data-onboarding='skip']",
    { timeout: 15_000 },
  );
  await passAccountGates(page);
}

test.describe("T-019 admin", () => {
  test("non-admin forbidden; after CLI promote → panel", async ({ page }) => {
    const email = uniqueE2eEmail("admin-promote");
    await page.goto("/admin/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Sign in|Увійти/,
    );
    await loginAs(page, email);
    await page.goto("/admin/");
    await page
      .locator("[data-admin='forbidden'], [data-admin='panel']")
      .first()
      .waitFor({ timeout: 15_000 });

    setRole(email, "user");
    await page.reload();
    await expect(page.locator("[data-admin='forbidden']")).toBeVisible({
      timeout: 15_000,
    });

    setRole(email, "admin");
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
    const email = uniqueE2eEmail("admin-forbid");
    await page.goto("/app/");
    await loginAs(page, email);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    const res = await page.request.get("/api/admin/users");
    expect(res.status()).toBe(404);
  });

  test("axe on /admin/ sign-in — no serious/critical", async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.locator("[data-auth='dev-login']")).toBeVisible({
      timeout: 15_000,
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots admin panel 375/768/1440 light+dark", async ({ page }) => {
    const email = uniqueE2eEmail("admin-shots");
    await page.goto("/admin/");
    await loginAs(page, email);
    setRole(email, "admin");
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
