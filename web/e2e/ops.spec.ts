import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, passAccountGates } from "./utils/auth";

const backendRoot = path.resolve(process.cwd(), "..", "backend");
const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-038");

function setAdmin(email: string) {
  execFileSync("uv", ["run", "python", "-m", "dictably.cli", "set-admin", email], {
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

function seedQueued(email: string) {
  execFileSync("uv", ["run", "python", "scripts/seed_queued.py", email], {
    cwd: backendRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      ENV: "test",
      DEV_LOGIN: "1",
      COOKIE_SECURE: "0",
      SEED_QUEUED_EMAIL: email,
    },
  });
}

function seedOps(email: string) {
  execFileSync("uv", ["run", "python", "scripts/seed_ops.py", email], {
    cwd: backendRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      ENV: "test",
      DEV_LOGIN: "1",
      COOKIE_SECURE: "0",
      SEED_OPS_EMAIL: email,
    },
  });
}

test.describe("T-038 ops + queued", () => {
  test("admin Ops tab screenshots light/dark 1440/375", async ({ page }) => {
    test.setTimeout(90_000);
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
    seedOps(email);
    await page.reload();
    await expect(page.locator("[data-admin='panel']")).toBeVisible({
      timeout: 15_000,
    });

    await page.locator("[data-admin='tab-ops']").click();
    await expect(page.locator("[data-admin='ops']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-admin='loading']")).toHaveCount(0);
    // S6: seeded non-zero queue / running for screenshots.
    await expect(page.locator("[data-admin='ops']")).toContainText(/[1-9]/);

    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    for (const width of [1440, 375] as const) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 900 : 812,
      });
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        if (scheme === "dark") {
          await page.evaluate(() => {
            document.documentElement.setAttribute("data-theme", "dark");
          });
        } else {
          await page.evaluate(() => {
            document.documentElement.removeAttribute("data-theme");
          });
        }
        if (width === 375) {
          // S6: page must not be wider than the viewport (tabs/nav overflow).
          const scrollWidth = await page.evaluate(
            () => document.documentElement.scrollWidth,
          );
          expect(scrollWidth).toBeLessThanOrEqual(375);
          await expect(page.locator("[data-shell='bottom-nav'] a")).toHaveCount(
            4,
          );
          const navBox = await page
            .locator("[data-shell='bottom-nav']")
            .boundingBox();
          expect(navBox?.height ?? 99).toBeLessThanOrEqual(64);
        }
        await page.screenshot({
          path: path.join(SHOT_ROOT, `ops-${width}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });

  test("queued status + hint screenshot", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const me = await page.request.get("/api/me");
    expect(me.ok()).toBeTruthy();
    const body = (await me.json()) as { email?: string };
    expect(body.email).toBeTruthy();
    seedQueued(body.email!);
    await page.reload();
    await ensureSignedIn(page);
    await expect(page.getByText(/In queue|У черзі/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Starts when the previous|Почнеться, коли завершиться/).first(),
    ).toBeVisible();

    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "queued-1440-light.png"),
      fullPage: true,
    });
  });
});
