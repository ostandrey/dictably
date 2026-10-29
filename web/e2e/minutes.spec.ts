import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./utils/auth";
import fs from "node:fs";
import path from "node:path";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-016");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

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

test.describe("T-016a weak badge", () => {
  test("weak verify shows Review badge", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t016a-weak-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    const row = page.locator("[data-recordings='row']").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });

    await page.route("**/api/media/*/analysis", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000099",
          media_id: "00000000-0000-4000-8000-000000000001",
          provider: "fake",
          model: "fake-v2",
          created_at: new Date().toISOString(),
          regenerations_left: 3,
          result: {
            language: "en",
            title: "Weak demo",
            parties: [{ id: "our", label: "Our side" }],
            participants: [],
            summary: [],
            decisions: [],
            agreements: [
              {
                party_id: "our",
                text: "Maybe ship the update if budget allows",
                segment_ids: ["S1"],
                start_ms: 1000,
                quote: "ship the update",
                verify: "weak",
                verify_reason: "Conditional commitment",
              },
            ],
            tasks: [],
            deadlines_and_facts: [],
            open_questions: [],
          },
        }),
      });
    });

    await row.click();
    await expect(page.locator("[data-minutes='weak']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator("[data-minutes='item'][data-verify='weak']"),
    ).toBeVisible();
    fs.mkdirSync(path.join("e2e", "__screenshots__", "T-016a"), {
      recursive: true,
    });
    await page.screenshot({
      path: path.join(
        "e2e",
        "__screenshots__",
        "T-016a",
        "weak-badge-1440-light.png",
      ),
      fullPage: true,
    });
  });
});
