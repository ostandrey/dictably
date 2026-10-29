import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-027");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

test.describe("T-027 minutes templates + N1 sign-in", () => {
  test.describe.configure({ mode: "serial" });

  test("upload Official → first pass agenda topics + Present", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t027-up-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator("[data-recordings='upload-details']")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator("[data-recordings='upload-template']")
      .selectOption("official_protocol");
    await page.locator("[data-recordings='upload-details-continue']").click();
    const row = page
      .locator("[data-recordings='row']")
      .filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
    await row.click();
    await expect(page.locator("[data-minutes='template']")).toHaveValue(
      "official_protocol",
    );
    await expect(page.locator("[data-minutes='agenda']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-minutes='agenda-topic']").first()).toBeVisible();
    await expect(
      page.getByText(/Discussion|Слухали|Decision|Вирішили/).first(),
    ).toBeVisible();
  });

  test("N1: sign-in main has ≥16px side padding at 375", async ({ page }) => {
    await page.context().clearCookies();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app/");
    const screen = page.locator("[data-auth='screen']");
    await expect(screen).toBeVisible({ timeout: 15_000 });
    const main = page.locator(".auth-screen__main");
    const card = page.locator("[data-auth='card']");
    await expect(card).toBeVisible();
    const pad = await main.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        left: Number.parseFloat(s.paddingLeft),
        right: Number.parseFloat(s.paddingRight),
      };
    });
    expect(pad.left).toBeGreaterThanOrEqual(16);
    expect(pad.right).toBeGreaterThanOrEqual(16);
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(15.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 - 15.5);
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow === "none" || shadow === "").toBeTruthy();
  });

  test("axe minutes with template — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator("[data-minutes='template']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("[data-recording='minutes']")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots official UI + PDF HTML 375/1440 light+dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });

    await page.goto("/app/");
    await ensureSignedIn(page);
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator("[data-minutes='template']")).toBeVisible();
    const tpl = page.locator("[data-minutes='template']");
    if ((await tpl.inputValue()) !== "official_protocol") {
      await tpl.selectOption("official_protocol");
      const regen = page.locator("[data-minutes='regenerate']");
      if (await regen.isVisible()) {
        await regen.click();
        await expect(page.locator("[data-minutes='agenda']")).toBeVisible({
          timeout: 30_000,
        });
      }
    }

    const mediaId = await page.evaluate(() => {
      const m = location.search.match(/[?&]id=([^&]+)/);
      return m?.[1] ?? "";
    });

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
          await page
            .getByRole("tab", { name: /Minutes|Протокол|Підсумки/ })
            .click();
        }
        await page.screenshot({
          path: path.join(SHOT_ROOT, `official-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }

    // PDF page via export HTML endpoint (same content as PDF).
    if (mediaId) {
      const res = await page.request.get(
        `/api/media/${mediaId}/export?kind=minutes&format=md`,
      );
      expect(res.ok()).toBeTruthy();
      const md = await res.text();
      expect(md).toMatch(/Agenda|Порядок|Discussion|Слухали|Decision|Вирішили/);
      fs.writeFileSync(path.join(SHOT_ROOT, "official-export.md"), md);

      // Render markdown-ish preview isn't available; capture export menu + minutes.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      const exportBtn = page.locator("[data-recording='export']");
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
        await page.screenshot({
          path: path.join(SHOT_ROOT, "official-export-menu-1440-light.png"),
        });
      }
    }

    // N1 sign-in
    await page.context().clearCookies();
    for (const scheme of ["light", "dark"] as const) {
      for (const vp of [
        { name: "375", width: 375, height: 812 },
        { name: "1440", width: 1440, height: 900 },
      ]) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await page.goto("/app/");
        await expect(page.locator("[data-auth='screen']")).toBeVisible({
          timeout: 15_000,
        });
        if (scheme === "dark") {
          await page.evaluate(() => {
            document.documentElement.setAttribute("data-theme", "dark");
          });
        } else {
          await page.evaluate(() => {
            document.documentElement.removeAttribute("data-theme");
          });
        }
        await page.screenshot({
          path: path.join(SHOT_ROOT, `signin-n1-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
