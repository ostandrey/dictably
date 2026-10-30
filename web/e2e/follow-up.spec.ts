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

  test("dialog with real draft + weak note + shots", async ({ page, context }) => {
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

    // N2: keep real draft; inject weak_texts so review sees the note list.
    await page.route("**/api/media/*/follow-up", async (route) => {
      const res = await route.fetch();
      const json = (await res.json()) as {
        subject: string;
        body: string;
        language: string;
        weak_skipped?: number;
        weak_texts?: string[];
      };
      json.weak_skipped = 2;
      json.weak_texts = [
        "Weak point needing review",
        "Another unverified agreement",
      ];
      await route.fulfill({
        status: res.status(),
        contentType: "application/json",
        body: JSON.stringify(json),
      });
    });

    await page.locator("[data-recording='export']").click();
    await expect(page.locator("[data-export='follow-up']")).toBeVisible();
    await page.locator("[data-export='follow-up']").click();

    const dialog = page.locator("[data-recording='follow-up-dialog']");
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-dialog='close']")).toBeVisible();
    const bodyVal = await page.locator("[data-follow-up='body']").inputValue();
    expect(bodyVal).not.toContain("Edited for e2e");
    expect(bodyVal.length).toBeGreaterThan(20);
    await expect(dialog).toContainText(/need review|потребують перевірки/i);
    await expect(dialog).toContainText("Weak point needing review");

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
