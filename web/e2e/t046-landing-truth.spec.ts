import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, uniqueE2eEmail } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT = path.join("e2e", "__screenshots__", "T-046");

test.describe("T-046 landing truth + why 3×2", () => {
  test("why grid 6 items + retention copy EN/UK + vocab clean", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT, { recursive: true });

    const expected = {
      en: [
        "Proof for every point",
        "Sides, not just speakers",
        "Any language",
        "Separate Zoom tracks",
        "No bot in your call",
        "Private by default",
      ],
      uk: [
        "Доказ для кожного пункту",
        "Сторони, а не лише спікери",
        "Будь-яка мова",
        "Окремі доріжки Zoom",
        "Без бота в дзвінку",
        "Приватно за замовчуванням",
      ],
    } as const;

    for (const locale of ["en", "uk"] as const) {
      const href = locale === "uk" ? "/uk/" : "/";
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(href);
      const why = page.locator("#why");
      await expect(why).toBeVisible();
      const titles = why.locator("h3");
      await expect(titles).toHaveCount(6);
      for (let i = 0; i < 6; i += 1) {
        await expect(titles.nth(i)).toHaveText(expected[locale][i]!);
      }
      await expect(why).toContainText(
        locale === "uk"
          ? "Оригінали файлів видаляються через 30 днів"
          : "Original files are deleted after 30 days",
      );
      await expect(why).not.toContainText("100%");
      await why.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(SHOT, `why-${locale}-1440-light.png`),
      });
      await page.setViewportSize({ width: 375, height: 812 });
      await why.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(SHOT, `why-${locale}-375-light.png`),
      });

      await page.goto(locale === "uk" ? "/uk/privacy/" : "/privacy/");
      await expect(page.locator("main")).toContainText(
        locale === "uk"
          ? "Оригінали видаляються через 30 днів"
          : "Original uploads are deleted after 30 days",
      );
      await page.goto(locale === "uk" ? "/uk/terms/" : "/terms/");
      await expect(page.locator("main")).toContainText(
        locale === "uk"
          ? "Оригінали файлів видаляються через 30 днів"
          : "Original files are deleted after 30 days",
      );
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings/");
    await ensureSignedIn(page);
    await expect(page.locator("[data-settings='vocabulary']")).toBeVisible();
    await expect(page.locator("[data-settings='vocabulary-input']")).toBeVisible();
    await page.locator("[data-settings='vocabulary-input']").fill("Acronis,");
    await page.locator("[data-settings='vocabulary-add']").click();
    await expect(page.locator("[data-settings='vocabulary-list']")).toContainText(
      "Acronis",
      { timeout: 10_000 },
    );
    await expect(
      page.locator("[data-settings='vocabulary-list']"),
    ).not.toContainText("Acronis,");
    await page.screenshot({
      path: path.join(SHOT, "settings-vocab-1440-light.png"),
    });
  });

  test("upload formats: hint groups + .xyz rejected before request", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    fs.mkdirSync(SHOT, { recursive: true });
    const email = uniqueE2eEmail("t046-fmt");
    const fixture = path.join("e2e", "fixtures", "short.wav");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app/");
    await ensureSignedIn(page, { email });
    // Dropzone shows only with 1–3 rows — seed one.
    const seed = `t046-seed-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name: seed,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(fixture),
    });
    await confirmUploadDetailsIfOpen(page);
    await expect(recordingRow(page, seed)).toBeVisible({ timeout: 30_000 });

    const zone = page.locator("[data-recordings='upload']");
    await expect(zone).toBeVisible();
    const hint = zone.locator(".dy-upload__hint");
    await expect(hint).toContainText("OPUS");
    await expect(hint).toContainText("AMR");
    await expect(hint).toContainText("3GP");
    await expect(hint).toContainText("AVI");
    await expect(hint).toContainText("WMA");
    const box = await hint.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(375);
    // Hint must not be clipped vertically on phone (overflow visible / wraps).
    const clipped = await hint.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.overflow === "hidden" && el.scrollHeight > el.clientHeight + 1;
    });
    expect(clipped).toBe(false);
    await zone.screenshot({
      path: path.join(SHOT, "upload-hint-375-light.png"),
    });

    let mediaPosts = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/media")) {
        mediaPosts += 1;
      }
    });
    await page.locator("[data-recordings='file']").setInputFiles({
      name: "clip.xyz",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not-a-media-file"),
    });
    await expect(page.locator("[data-recordings='error']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-recordings='error']")).toContainText(
      /not supported|не підтримується/i,
    );
    expect(mediaPosts).toBe(0);
  });
});
