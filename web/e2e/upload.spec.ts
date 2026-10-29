import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./utils/auth";
import { confirmUploadDetailsIfOpen } from "./utils/upload";
import fs from "node:fs";
import path from "node:path";
import { VIEWPORTS } from "./utils/shots";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-012");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

/** S4: unique filename per upload so list/screenshots don't pile identical short.wav. */
function uniqueFixture() {
  const name = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  return {
    name,
    mimeType: "audio/wav",
    buffer: fs.readFileSync(FIXTURE),
  };
}

test.describe("T-012 upload + my recordings", () => {
  // Shared backend DB — avoid parallel list/upload races.
  test.describe.configure({ mode: "serial" });

  test("Dev login → upload wav → appears in list", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    // Wait for list fetch to settle (empty or rows) before counting.
    await expect(
      page.locator("[data-recordings='empty'], [data-recordings='row']").first(),
    ).toBeVisible();

    const file = uniqueFixture();
    await page.locator("[data-recordings='file']").setInputFiles(file);
    await confirmUploadDetailsIfOpen(page);
    const row = page
      .locator("[data-recordings='row']")
      .filter({ hasText: file.name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    // T-013/14: fake path reaches ready (inline process in ENV=test).
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
  });

  test("client blocks oversized file without posting", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    await expect(
      page.locator("[data-recordings='empty'], [data-recordings='row']").first(),
    ).toBeVisible();

    const before = await page.locator("[data-recordings='row']").count();
    await page.evaluate(() => {
      const input = document.querySelector(
        "[data-recordings='file']",
      ) as HTMLInputElement;
      const file = new File(["x"], "huge.wav", { type: "audio/wav" });
      Object.defineProperty(file, "size", { value: 501 * 1024 * 1024 });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.locator("[data-recordings='error']")).toContainText(
      "500 MB",
    );
    await expect(page.locator("[data-recordings='row']")).toHaveCount(before);
  });

  test("axe on signed-in /app/ — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots signed-in upload 375/768/1440 light+dark", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    for (const route of [
      { locale: "en" as const, path: "/app/" },
      { locale: "uk" as const, path: "/uk/app/" },
    ]) {
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const vp of VIEWPORTS.filter((v) =>
          ["375", "768", "1440"].includes(v.name),
        )) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(route.path);
          await ensureSignedIn(page);
          await page.screenshot({
            path: path.join(
              SHOT_ROOT,
              `${route.locale}-${vp.name}-${scheme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });
});
