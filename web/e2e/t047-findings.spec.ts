import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, uniqueE2eEmail } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT = path.join("e2e", "__screenshots__", "T-047");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

async function seedReady(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.locator("[data-recordings='file']").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: fs.readFileSync(FIXTURE),
  });
  await confirmUploadDetailsIfOpen(page);
  const row = recordingRow(page, name);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
  return row;
}

test.describe("T-047 F1 Chromium touch", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    hasTouch: true,
    isMobile: true,
  });

  test("F1 mobile sheet: rename + delete via tap (Chromium)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT, { recursive: true });
    const email = uniqueE2eEmail("t047-f1");
    await page.goto("/app/");
    await ensureSignedIn(page, { email });
    const name = `t047-f1-${Date.now()}.wav`;
    const row = await seedReady(page, name);

    await row.locator("[data-recordings='menu']").tap();
    await expect(page.locator("[data-sheet='panel']")).toBeVisible();
    await page.locator("[data-recordings='rename']").tap();
    await expect(page.locator("[data-recordings='rename-input']")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator("[data-recordings='rename-input']").fill("Renamed F1");
    await page.getByRole("button", { name: /Save|Зберегти/ }).tap();
    await expect(recordingRow(page, name)).toContainText("Renamed F1", {
      timeout: 10_000,
    });

    await recordingRow(page, name).locator("[data-recordings='menu']").tap();
    await expect(page.locator("[data-sheet='panel']")).toBeVisible();
    await page.locator("[data-recordings='delete']").tap();
    await expect(recordingRow(page, name)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator("[data-toast='action']")).toBeVisible();
    await page.locator("[data-toast='action']").tap();
    await expect(recordingRow(page, name)).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: path.join(SHOT, "list-375-en-light.png"),
    });
  });
});

test.describe("T-047 F2–F4", () => {
  test("F2 /uk/ chrome is Ukrainian (no hardcoded EN chrome)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT, { recursive: true });
    const email = uniqueE2eEmail("t047-uk");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/uk/app/");
    await ensureSignedIn(page, { email });
    await expect(page.locator("[data-recordings='panel'] h1")).toHaveText(
      "Записи",
    );
    await expect(page.getByText("Recordings", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Minutes", { exact: true })).toHaveCount(0);
    const quota = page.locator("[data-minutes], [data-recordings='quota-hint']");
    if ((await quota.count()) > 0 && (await quota.first().isVisible())) {
      const q = await quota.first().innerText();
      expect(q).not.toMatch(/\bh\b|\bmin\b|\bleft\b/i);
    }

    const name = `t047-uk-${Date.now()}.wav`;
    await seedReady(page, name);
    await recordingRow(page, name).click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-recording='export']")).toHaveCount(0);
    await expect(page.getByText("Export", { exact: true })).toHaveCount(0);

    await page.screenshot({
      path: path.join(SHOT, "recording-375-uk-light.png"),
    });
    await page.goto("/uk/app/");
    await page.screenshot({
      path: path.join(SHOT, "list-375-uk-light.png"),
    });
  });

  test("F4 onboarding meeting locale defaults to page locale", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const email = uniqueE2eEmail("t047-f4");
    await page.goto("/uk/app/");
    await ensureSignedIn(page, { email, skipOnboarding: false });
    const meeting = page.locator("[data-onboarding='meeting-locale']");
    await expect(meeting).toBeVisible({ timeout: 15_000 });
    await expect(meeting).toHaveValue("uk");
    await page.locator("[data-onboarding='skip']").click();
    await page.goto("/uk/app/settings/");
    await expect(page.locator("[data-settings='locale']")).toHaveValue("uk");
  });
});
