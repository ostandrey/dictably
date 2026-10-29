import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-035b");

async function shot(
  page: import("@playwright/test").Page,
  name: string,
  width: number,
) {
  await page.setViewportSize({ width, height: width >= 1000 ? 900 : 812 });
  fs.mkdirSync(SHOT_ROOT, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_ROOT, `${name}-${width}.png`),
    fullPage: true,
  });
}

test.describe("T-035b multi-file Zoom meeting", () => {
  test.describe.configure({ mode: "serial" });

  test("two files → two named speakers; merge works", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await ensureSignedIn(page);

    const buf = fs.readFileSync(FIXTURE);
    await page.locator("[data-recordings='file']").setInputFiles([
      {
        name: "audioOlena.m4a",
        mimeType: "audio/mp4",
        buffer: buf,
      },
      {
        name: "audioAndriy.m4a",
        mimeType: "audio/mp4",
        buffer: buf,
      },
    ]);

    const details = page.locator("[data-recordings='upload-details']");
    await expect(details).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("[data-recordings='upload-meeting-bundle']"),
    ).toBeVisible();
    await shot(page, "upload-bundle", 1440);
    await shot(page, "upload-bundle", 375);
    await confirmUploadDetailsIfOpen(page);

    const row = page.locator("[data-recordings='row']").filter({
      hasText: /Olena|Andriy|Meeting/,
    });
    await expect(row.first()).toBeVisible({ timeout: 60_000 });
    await expect(row.first()).toContainText(/Ready|Готово/, { timeout: 60_000 });
    await row.first().click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });

    const chips = page.locator(".rec-page__speakers .dy-speaker");
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByText("Olena", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Andriy", { exact: true }).first()).toBeVisible();
    await shot(page, "two-speakers", 1440);
    await shot(page, "two-speakers", 375);

    await page.locator("[data-recording='rename']").click();
    await expect(page.locator("[data-dialog='open']")).toBeVisible();
    await expect(page.locator("[data-recording='merge-speakers']").first()).toBeVisible();
    const keep = page.locator("[data-recording='merge-keep']").first();
    const options = keep.locator("option");
    expect(await options.count()).toBeGreaterThanOrEqual(2);
    const keepValue = await options.nth(1).getAttribute("value");
    await keep.selectOption(keepValue || "");
    await page.getByRole("button", { name: /Save|Зберегти/i }).click();
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(chips).toHaveCount(1, { timeout: 10_000 });
  });
});
