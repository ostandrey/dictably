import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT = path.join("e2e", "__screenshots__", "T-042");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

async function setTheme(
  page: import("@playwright/test").Page,
  scheme: "light" | "dark",
) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.evaluate((s) => {
    if (s === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, scheme);
}

test.describe("T-042 Zoom tracks + vocabulary", () => {
  test.describe.configure({ mode: "serial" });

  test("landing why Zoom tracks + learn vocab flow", async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(SHOT, { recursive: true });

    for (const locale of ["en", "uk"] as const) {
      const href = locale === "uk" ? "/uk/" : "/";
      await page.setViewportSize({ width: 1440, height: 900 });
      await setTheme(page, "light");
      await page.goto(href);
      const why = page.locator("#why");
      await expect(why).toBeVisible();
      await expect(why).toContainText(
        locale === "uk" ? "Окремі доріжки Zoom" : "Separate Zoom tracks",
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
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await ensureSignedIn(page);

    const name = `t042-${Date.now()}.wav`;
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
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });

    const word = page.locator("[data-recording='word']").first();
    await expect(word).toBeVisible({ timeout: 30_000 });
    await word.click();
    const input = page.locator("[data-recording='word-input']");
    await expect(input).toBeVisible();
    await input.fill("Acronis");
    await input.press("Enter");
    await expect(page.locator("[data-toast='item']")).toContainText(/Acronis/, {
      timeout: 10_000,
    });
    const learned = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/me/vocabulary") &&
        r.ok(),
      { timeout: 15_000 },
    );
    await page.locator("[data-toast='action']").click();
    await learned;
    await expect(page.locator("[data-toast='item']")).toHaveCount(0, {
      timeout: 5_000,
    });

    await page.goto("/app/settings/");
    await expect(page.locator("[data-settings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-settings='vocabulary-list']")).toContainText(
      "Acronis",
      { timeout: 10_000 },
    );
    await page.screenshot({
      path: path.join(SHOT, "settings-vocab-1440-light.png"),
    });

    let uploadedVocab: string[] | null = null;
    await page.route("**/api/media**", async (route) => {
      const req = route.request();
      const url = req.url();
      if (
        req.method() === "POST" &&
        /\/api\/media\/?$/.test(url.split("?")[0] ?? "")
      ) {
        const res = await route.fetch();
        const body = (await res.json()) as { vocabulary?: string[] };
        uploadedVocab = body.vocabulary ?? [];
        await route.fulfill({ response: res, json: body });
        return;
      }
      await route.continue();
    });

    await page.goto("/app/");
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    const name2 = `t042-next-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name: name2,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    await expect(recordingRow(page, name2)).toBeVisible({ timeout: 30_000 });
    expect(uploadedVocab).not.toBeNull();
    expect(uploadedVocab!).toContain("Acronis");

    await page.goto("/app/settings/");
    await expect(page.locator("[data-settings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator(`[data-settings='vocabulary-remove'][data-term='Acronis']`)
      .click();
    await expect(page.locator("[data-settings='vocabulary-list']")).toHaveCount(
      0,
      { timeout: 10_000 },
    );
  });
});
