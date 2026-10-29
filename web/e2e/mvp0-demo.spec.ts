/**
 * MVP-0 demo video: landing → Dev login → upload → Ready → minutes seek → admin.
 * Output: e2e/__screenshots__/MVP0/demo.webm
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { passAccountGates } from "./utils/auth";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "MVP0");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const backendRoot = path.resolve(process.cwd(), "..", "backend");
/** Default email from web `devLogin()` helper. */
const ADMIN_EMAIL = "dev@example.com";

test.describe("MVP-0 demo path", () => {
  test.describe.configure({ mode: "serial" });

  test("full path video for Owner review", async ({ browser }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });

    const context = await browser.newContext({
      recordVideo: {
        dir: SHOT_ROOT,
        size: { width: 1280, height: 720 },
      },
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      // 1. Landing → app
      await page.goto("/");
      await expect(page.locator(".hero__cta [data-cta='app']")).toBeVisible();
      await page.locator(".hero__cta [data-cta='app']").click();
      await expect(page).toHaveURL(/\/app\/$/);

      // 2. Dev login (same path as other e2e)
      await page.locator("[data-auth='dev-login']").click();
      await page.waitForSelector(
        "[data-consent='accept'], [data-recordings='panel']",
        { timeout: 15_000 },
      );
      await passAccountGates(page);
      await expect(page.locator("[data-recordings='panel']")).toBeVisible({
        timeout: 15_000,
      });

      // 3. Upload → Ready
      const name = `mvp0-${Date.now()}.wav`;
      await page.locator("[data-recordings='file']").setInputFiles({
        name,
        mimeType: "audio/wav",
        buffer: fs.readFileSync(FIXTURE),
      });
    await confirmUploadDetailsIfOpen(page);
      const row = page
        .locator("[data-recordings='row']")
        .filter({ hasText: name });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText(/Ready|Готово/, { timeout: 60_000 });

      // 4. Recording: transcript + minutes click
      await row.click();
      await expect(page.locator("[data-recording='page']")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.locator("[data-recording='segment']").first(),
      ).toBeVisible();
      await expect(page.locator("[data-recording='minutes']")).toBeVisible();
      const item = page.locator("[data-minutes='item']").first();
      await expect(item).toBeVisible({ timeout: 15_000 });
      await item.click();
      await page.waitForTimeout(600);
      await expect(
        page.locator("[data-recording='segment'].is-evidence"),
      ).toBeVisible();

      // 5. Rename speaker
      await page.locator("[data-recording='rename']").click();
      const nameInput = page.locator(".rec-rename__list input").first();
      await nameInput.fill("Alex");
      await page.getByRole("button", { name: /Save|Зберегти/ }).click();
      await expect(page.locator(".rec-page__speakers")).toContainText("Alex", {
        timeout: 10_000,
      });

      // 6. Admin after CLI promote
      execFileSync(
        "uv",
        ["run", "python", "-m", "dictably.cli", "set-admin", ADMIN_EMAIL],
        {
          cwd: backendRoot,
          stdio: "pipe",
          shell: true,
          env: {
            ...process.env,
            ENV: "test",
            DEV_LOGIN: "1",
            COOKIE_SECURE: "0",
          },
        },
      );
      await page.goto("/admin/");
      await expect(page.locator("[data-admin='panel']")).toBeVisible({
        timeout: 15_000,
      });
      await page.locator("[data-admin='tab-jobs']").click();
      await expect(page.locator("[data-admin='filter-failed']")).toBeVisible();
      await page.waitForTimeout(800);
    } finally {
      const video = page.video();
      await context.close();
      if (video) {
        const dest = path.join(SHOT_ROOT, "demo.webm");
        await video.saveAs(dest);
        for (const f of fs.readdirSync(SHOT_ROOT)) {
          if (f.endsWith(".webm") && f !== "demo.webm") {
            fs.unlinkSync(path.join(SHOT_ROOT, f));
          }
        }
        expect(fs.existsSync(dest)).toBe(true);
        expect(fs.statSync(dest).size).toBeGreaterThan(10_000);
      }
    }
  });
});
