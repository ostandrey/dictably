import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, uniqueE2eEmail } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const EMAIL = uniqueE2eEmail("t051-retry");
const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-051");

async function setTheme(
  page: import("@playwright/test").Page,
  scheme: "light" | "dark",
) {
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
}

async function forceMinutesFailed(
  page: import("@playwright/test").Page,
  mediaId: string,
  retryState: { failPost: boolean },
) {
  await page.route(`**/api/media/${mediaId}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const res = await route.fetch();
    const body = await res.json();
    body.minutes_status = "failed";
    await route.fulfill({
      status: res.status(),
      headers: { ...res.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });
  await page.route(`**/api/media/${mediaId}/analysis`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not found" }),
      });
      return;
    }
    if (route.request().method() === "POST" && retryState.failPost) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ detail: "llm failed" }),
      });
      return;
    }
    await route.continue();
  });
}

test.describe("T-051 minutes failed UI", () => {
  test("failed → retry fail: one block; retry success: minutes show", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await ensureSignedIn(page, { email: EMAIL });

    const name = `t051-retry-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible();
    await expect(page.locator("[data-minutes='item']").first()).toBeVisible({
      timeout: 15_000,
    });

    const mediaId = new URL(page.url()).searchParams.get("id");
    expect(mediaId).toBeTruthy();

    const retryState = { failPost: true };
    await forceMinutesFailed(page, mediaId!, retryState);

    await page.reload();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("tab", { name: /Minutes|Протокол/ }).click();
    const failed = page.locator("[data-minutes='failed']");
    await expect(failed).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-minutes='failed-retry']")).toHaveCount(1);
    await expect(page.locator("[data-minutes='error']")).toHaveCount(0);

    // B1: text must not sit in the 20px icon column.
    const explainBox = await page
      .locator("[data-minutes='empty-explain']")
      .boundingBox();
    expect(explainBox).toBeTruthy();
    expect(explainBox!.width).toBeGreaterThan(200);

    await page.locator("[data-minutes='failed-retry']").click();
    await expect(failed).toBeVisible();
    await expect(page.locator("[data-minutes='empty-explain']")).toContainText(
      /again|знову/i,
    );
    await expect(page.locator("[data-minutes='failed-retry']")).toHaveCount(1);
    await expect(page.locator("[data-minutes='error']")).toHaveCount(0);
    await expect(page.locator("[data-minutes='error-wrap']")).toHaveCount(0);
    const againBox = await page
      .locator("[data-minutes='empty-explain']")
      .boundingBox();
    expect(againBox!.width).toBeGreaterThan(200);

    // Success path: allow POST through and clear failed flag on media.
    retryState.failPost = false;
    await page.unroute(`**/api/media/${mediaId}/analysis`);
    await page.unroute(`**/api/media/${mediaId}`);
    await page.locator("[data-minutes='failed-retry']").click();
    await expect(page.locator("[data-minutes='item']").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("[data-minutes='failed']")).toHaveCount(0);
  });

  test("screenshots failed block 375/1440 light+dark", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page, { email: uniqueE2eEmail("t051-shots") });

    const name = `t051-shots-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible();
    await expect(page.locator("[data-minutes='item']").first()).toBeVisible({
      timeout: 15_000,
    });

    const mediaId = new URL(page.url()).searchParams.get("id");
    expect(mediaId).toBeTruthy();
    const retryState = { failPost: true };
    await forceMinutesFailed(page, mediaId!, retryState);
    await page.reload();

    for (const scheme of ["light", "dark"] as const) {
      await setTheme(page, scheme);
      for (const vp of [
        { name: "375", width: 375, height: 812 },
        { name: "1440", width: 1440, height: 900 },
      ]) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        if (vp.width <= 400) {
          await page.getByRole("tab", { name: /Minutes|Протокол/ }).click();
        }
        await expect(page.locator("[data-minutes='failed']")).toBeVisible({
          timeout: 15_000,
        });
        await page.screenshot({
          path: path.join(SHOT_ROOT, `failed-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }

    // Again state at 375 light.
    await setTheme(page, "light");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("tab", { name: /Minutes|Протокол/ }).click();
    await page.locator("[data-minutes='failed-retry']").click();
    await expect(page.locator("[data-minutes='empty-explain']")).toContainText(
      /again|знову/i,
    );
    await page.screenshot({
      path: path.join(SHOT_ROOT, "failed-again-375-light.png"),
      fullPage: true,
    });
  });
});
