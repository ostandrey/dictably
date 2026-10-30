import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-028");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

test.describe("T-028 follow-up email", () => {
  test.describe.configure({ mode: "serial" });

  test("dialog edit + copy + shots 375/1440", async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });

    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t028-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const row = page.locator("[data-recordings='row']").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 90_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible();
    await expect(page.locator("[data-recording='export']")).toBeVisible();

    await page.locator("[data-recording='export']").click();
    await expect(page.locator("[data-recording='export-menu']")).toBeVisible();
    await expect(page.locator("[data-export='follow-up']")).toBeVisible();

    const apiPromise = page.waitForResponse((r) => r.url().includes("/follow-up"));
    await page.locator("[data-export='follow-up']").click();
    const apiRes = await apiPromise;
    expect(apiRes.ok()).toBeTruthy();

    const dialog = page.locator("[data-recording='follow-up-dialog']");
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-follow-up='subject']")).not.toHaveValue("");
    await expect(page.locator("[data-follow-up='body']")).not.toHaveValue("");
    await expect(page.locator("[data-follow-up='copy']")).toBeVisible();
    await expect(page.locator("[data-follow-up='mailto']")).toBeVisible();

    await page.locator("[data-follow-up='body']").fill(
      "Thank you for the meeting.\n\n- Edited for e2e.\n",
    );
    await page.locator("[data-follow-up='copy']").click();

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      for (const vp of [
        { name: "375", width: 375, height: 812 },
        { name: "1440", width: 1440, height: 900 },
      ]) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        if (scheme === "dark") {
          await page.evaluate(() => {
            document.documentElement.setAttribute("data-theme", "dark");
          });
        } else {
          await page.evaluate(() => {
            document.documentElement.removeAttribute("data-theme");
          });
        }
        await expect(dialog).toBeVisible();
        await page.screenshot({
          path: path.join(SHOT_ROOT, `follow-up-dialog-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });

  test("axe follow-up dialog — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await page.locator("[data-recording='export']").click();
    await page.locator("[data-export='follow-up']").click();
    await expect(page.locator("[data-recording='follow-up-dialog']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("[data-dialog='open']")
      .analyze();
    const bad = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(bad).toEqual([]);
  });
});
