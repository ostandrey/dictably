import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, uniqueE2eEmail } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const FIXTURE = path.join("e2e", "fixtures", "short.wav");

/** T-047 F1 — WebKit project only (see playwright.config). */
test("F1 mobile sheet delete via tap (WebKit)", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueE2eEmail("t047-wk");
  await page.goto("/app/");
  await ensureSignedIn(page, { email });
  const name = `t047-wk-${Date.now()}.wav`;
  await page.locator("[data-recordings='file']").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: fs.readFileSync(FIXTURE),
  });
  await confirmUploadDetailsIfOpen(page);
  const row = recordingRow(page, name);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
  await row.locator("[data-recordings='menu']").tap();
  await expect(page.locator("[data-sheet='panel']")).toBeVisible();
  await page.locator("[data-recordings='delete']").tap();
  await expect(recordingRow(page, name)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("[data-toast='action']")).toBeVisible();
});
