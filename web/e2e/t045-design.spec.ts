import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT = path.join("e2e", "__screenshots__", "T-045");
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

test.describe("T-045 design Round 2", () => {
  test.describe.configure({ mode: "serial" });

  test("screenshots: landing + icons with/without + recording crumb", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(SHOT, { recursive: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, "light");
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({
      path: path.join(SHOT, "landing-1440-light.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({
      path: path.join(SHOT, "landing-375-light.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t045-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await confirmUploadDetailsIfOpen(page);
    const row = recordingRow(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });

    await page.screenshot({
      path: path.join(SHOT, "list-icons-1440-light.png"),
      fullPage: true,
    });
    // Toggle icons off for Owner compare (D6).
    await page.addStyleTag({
      content: `.app-nav__icon, .rec-page__export-btn svg, .rec-page__share-btn svg, .rec-page__more-btn svg, .dy-rec__menu-btn svg { display: none !important; }`,
    });
    await page.screenshot({
      path: path.join(SHOT, "list-no-icons-1440-light.png"),
      fullPage: true,
    });

    await page.goto("/app/");
    await ensureSignedIn(page);
    await recordingRow(page, name).click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-recording='export']")).toBeVisible();
    await expect(page.locator("[data-recording='share']")).toBeVisible();
    await page.screenshot({
      path: path.join(SHOT, "recording-icons-1440-light.png"),
      fullPage: true,
    });
    await page.addStyleTag({
      content: `.app-nav__icon, .rec-page__export-btn svg, .rec-page__share-btn svg, .rec-page__more-btn svg { display: none !important; }`,
    });
    await page.screenshot({
      path: path.join(SHOT, "recording-no-icons-1440-light.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: path.join(SHOT, "recording-375-light.png"),
      fullPage: true,
    });
  });
});
