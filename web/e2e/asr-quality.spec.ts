import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-035");

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

async function openReadyRecording(page: import("@playwright/test").Page) {
  await page.goto("/app/");
  await ensureSignedIn(page);
  const name = `t035-${Date.now()}.wav`;
  await page.locator("[data-recordings='file']").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: fs.readFileSync(FIXTURE),
  });
  await confirmUploadDetailsIfOpen(page);
  const row = page.locator("[data-recordings='row']").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
  await row.click();
  await expect(page.locator("[data-recording='page']")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("[data-recording='segment']").first()).toBeVisible();
  return name;
}

test.describe("T-035 transcript quality", () => {
  test.describe.configure({ mode: "serial" });

  test("edit word + merge speakers", async ({ page }) => {
    test.setTimeout(90_000);
    await openReadyRecording(page);

    await expect(page.locator("[data-recording='meeting-date']")).toBeVisible();

    const word = page.locator("[data-recording='word']").first();
    await expect(word).toBeVisible();
    const before = (await word.textContent())?.trim() || "";
    await word.click();
    const input = page.locator("[data-recording='word-input']");
    await expect(input).toBeVisible();
    await shot(page, "word-edit", 1440);
    await shot(page, "word-edit", 375);
    await input.fill("CorrectedWord");
    await input.press("Enter");
    await expect(page.locator("[data-recording='word']").first()).toContainText(
      "CorrectedWord",
      { timeout: 10_000 },
    );
    expect(before).not.toBe("CorrectedWord");

    await page.locator("[data-recording='rename']").click();
    await expect(page.locator("[data-dialog='open']")).toBeVisible();
    await expect(page.locator("[data-recording='merge-speakers']").first()).toBeVisible();
    await shot(page, "merge-dialog", 1440);
    await shot(page, "merge-dialog", 375);
    const keep = page.locator("[data-recording='merge-keep']").first();
    const options = keep.locator("option");
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const keepValue = await options.nth(1).getAttribute("value");
    await keep.selectOption(keepValue || "");
    await page.getByRole("button", { name: /Save|Зберегти/i }).click();
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0, {
      timeout: 10_000,
    });
    const chips = page.locator(".rec-page__speakers .dy-speaker");
    await expect(chips).toHaveCount(1, { timeout: 10_000 });
  });
});
