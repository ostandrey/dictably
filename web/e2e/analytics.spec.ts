import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { passAccountGates } from "./utils/auth";

const backendRoot = path.resolve(process.cwd(), "..", "backend");
const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-034");

function backendCli(args: string[]) {
  execFileSync("uv", ["run", "python", "-m", "dictably.cli", ...args], {
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

function setAdmin(email: string) {
  backendCli(["set-admin", email]);
}

function seedFunnel() {
  backendCli(["seed-funnel"]);
}

test.describe("T-034 product funnel", () => {
  test("admin funnel cohort UI + shots light/dark", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/admin/");
    await page.locator("[data-auth='dev-login']").click();
    await page.waitForSelector(
      "[data-consent='accept'], [data-admin='forbidden'], [data-admin='panel']",
      { timeout: 15_000 },
    );
    await passAccountGates(page);
    const me = await page.request.get("/api/me");
    const email = ((await me.json()) as { email: string }).email;
    setAdmin(email);
    seedFunnel();
    await page.reload();
    await expect(page.locator("[data-admin='panel']")).toBeVisible({
      timeout: 15_000,
    });

    await page.locator("[data-admin='tab-funnel']").click();
    await expect(page.locator("[data-admin='funnel']")).toBeVisible();
    await expect(page.locator("[data-admin='loading']")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.locator("[data-admin='funnel-meta']")).toBeVisible();
    await expect(page.locator("[data-admin='funnel-steps']")).toContainText(
      /Signed up|Зареєструвались/,
    );
    // N1: seeded cohort — not all zeros.
    await expect(page.locator("[data-admin='funnel-meta']")).not.toContainText(
      /^0$/,
    );
    await expect(page.locator("[data-admin='funnel-7']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.locator("[data-admin='funnel-30']").click();
    await expect(page.locator("[data-admin='funnel-30']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("[data-admin='funnel']")).toBeVisible();

    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      if (scheme === "dark") {
        await page.evaluate(() => {
          document.documentElement.setAttribute("data-theme", "dark");
        });
      } else {
        await page.evaluate(() => {
          document.documentElement.removeAttribute("data-theme");
        });
      }
      await page.screenshot({
        path: path.join(SHOT_ROOT, `funnel-1440-${scheme}.png`),
        fullPage: true,
      });
    }
  });
});
