import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-016");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

async function ensureSignedIn(page: import("@playwright/test").Page) {
  await page.waitForSelector(
    "[data-auth='dev-login'], [data-recordings='panel']",
  );
  const panel = page.locator("[data-recordings='panel']");
  if (await panel.isVisible()) return;
  const login = page.locator("[data-auth='dev-login']");
  await expect(login).toBeEnabled({ timeout: 15_000 });
  await login.click();
  await expect(panel).toBeVisible({ timeout: 15_000 });
}

test.describe("T-016 minutes + M1/M2", () => {
  test.describe.configure({ mode: "serial" });

  test("minutes item click → seek ±0.3s; regenerate visible", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t016-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    const row = page.locator("[data-recordings='row']").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible();
    await expect(page.locator("[data-recording='minutes']")).toBeVisible();
    await expect(page.locator("[data-minutes='item']").first()).toBeVisible({
      timeout: 15_000,
    });

    const item = page.locator("[data-minutes='item']").first();
    const startMs = Number(await item.getAttribute("data-start-ms"));
    expect(startMs).toBeGreaterThanOrEqual(0);
    await item.click();
    await page.waitForTimeout(400);
    const current = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-recording='audio']",
      ) as HTMLAudioElement | null;
      return el?.currentTime ?? -1;
    });
    expect(Math.abs(current - startMs / 1000)).toBeLessThanOrEqual(0.3);
    await expect(page.locator("[data-recording='segment'].is-evidence")).toBeVisible();
    await expect(page.locator("[data-minutes='regenerate']")).toBeVisible();
  });

  test("M1 mobile bottom nav; sidebar hidden at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app/");
    await ensureSignedIn(page);
    await expect(page.locator("[data-shell='bottom-nav']")).toBeVisible();
    await expect(page.locator("[data-shell='sidebar']")).toBeHidden();
    await page.locator("[data-shell='bottom-nav'] a").nth(2).click();
    await expect(page).toHaveURL(/\/app\/settings\/?/);
    await expect(page.locator("[data-shell='settings-main']")).toBeVisible();
  });

  test("axe recording with minutes — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator("[data-recording='minutes']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots 375/1440 light+dark", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page);
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator("[data-recording='minutes']")).toBeVisible();

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
        if (vp.width <= 400) {
          await page.getByRole("tab", { name: /Minutes|Протокол/ }).click();
        }
        await page.screenshot({
          path: path.join(SHOT_ROOT, `en-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
