import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./utils/auth";
import { confirmUploadDetailsIfOpen } from "./utils/upload";
import fs from "node:fs";
import path from "node:path";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-018");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

async function ensureReadyRow(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.locator("[data-recordings='file']").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: fs.readFileSync(FIXTURE),
  });
    await confirmUploadDetailsIfOpen(page);
  const row = page.locator("[data-recordings='row']").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
  return row;
}

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

test.describe("T-018-lite delete + C1–C2", () => {
  test.describe.configure({ mode: "serial" });

  test("delete recording → gone from list; audio 404", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t018-${Date.now()}.wav`;
    const row = await ensureReadyRow(page, name);

    const href = await row.locator("a.dy-rec__title").getAttribute("href");
    expect(href).toBeTruthy();
    const id = new URL(href!, "http://127.0.0.1").searchParams.get("id");
    expect(id).toBeTruthy();

    await row.locator("[data-recordings='menu']").click();
    await page.locator("[data-recordings='delete']").click();
    await expect(page.locator(".dy-dialog")).toBeVisible();
    await page.locator("[data-recordings='delete-confirm']").click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    const audioRes = await page.request.get(`/api/media/${id}/audio`);
    expect(audioRes.status()).toBe(404);
  });

  test("row click opens recording (B1 stretch link)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t018-row-${Date.now()}.wav`;
    const row = await ensureReadyRow(page, name);
    // Whole row is clickable via title::after stretch link (same as minutes.spec).
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("axe recordings list — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots: list+menu+dialog+dark+minutes (B2)", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t018-shot-${Date.now()}.wav`;
    const row = await ensureReadyRow(page, name);

    // 1440 light — menu open
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, "light");
    await row.locator("[data-recordings='menu']").click();
    await expect(page.locator("[data-recordings='delete']")).toBeVisible();
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-menu-1440-light.png"),
      fullPage: true,
    });

    // dialog
    await page.locator("[data-recordings='delete']").click();
    await expect(page.locator(".dy-dialog")).toBeVisible();
    await page.screenshot({
      path: path.join(SHOT_ROOT, "dialog-1440-light.png"),
      fullPage: true,
    });
    await page.locator("[data-recordings='delete-keep']").click();
    await expect(page.locator(".dy-dialog")).toHaveCount(0);

    // 375 light — menu
    await page.setViewportSize({ width: 375, height: 812 });
    await setTheme(page, "light");
    await row.locator("[data-recordings='menu']").click();
    await expect(page.locator("[data-recordings='delete']")).toBeVisible();
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-menu-375-light.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await page.locator("body").click({ position: { x: 8, y: 8 } });

    // 1440 dark — must differ from light
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, "dark");
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            getComputedStyle(document.documentElement).getPropertyValue(
              "--canvas",
            ).trim(),
        ),
      )
      .not.toBe("");
    const canvasDark = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim(),
    );
    await setTheme(page, "light");
    const canvasLight = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim(),
    );
    expect(canvasDark).not.toBe(canvasLight);
    await setTheme(page, "dark");
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-1440-dark.png"),
      fullPage: true,
    });

    // B3: title ink in dark (not inherited muted/link blue-on-dark)
    const titleColor = await page
      .locator("a.dy-rec__title")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(titleColor).toMatch(/rgb\(/);
    const rgb = titleColor.match(/\d+/g)?.map(Number) ?? [];
    // Light-ish ink on dark canvas (luma roughly > 140)
    const luma = 0.2126 * (rgb[0] ?? 0) + 0.7152 * (rgb[1] ?? 0) + 0.0722 * (rgb[2] ?? 0);
    expect(luma).toBeGreaterThan(140);

    // minutes page for B4 / C2 width — after layout fix text column ≫ ~130px
    await setTheme(page, "light");
    await row.click();
    await expect(page.locator("[data-recording='minutes']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-minutes='item']").first()).toBeVisible({
      timeout: 15_000,
    });
    const widths = await page.locator("[data-minutes='item']").first().evaluate((el) => {
      const body = el.querySelector(".dy-item__body") as HTMLElement | null;
      const text = el.querySelector(".dy-item__text") as HTMLElement | null;
      const panel = el.closest("[data-recording='minutes']") as HTMLElement | null;
      return {
        item: el.getBoundingClientRect().width,
        body: body?.getBoundingClientRect().width ?? 0,
        text: text?.getBoundingClientRect().width ?? 0,
        panel: panel?.getBoundingClientRect().width ?? 0,
      };
    });
    // Before fix: text ~130px; after grid 1.75fr/1fr body should be ≫ 130 at 1440.
    expect(widths.panel, JSON.stringify(widths)).toBeGreaterThanOrEqual(360);
    expect(widths.body, JSON.stringify(widths)).toBeGreaterThanOrEqual(200);
    await page.screenshot({
      path: path.join(SHOT_ROOT, "minutes-1440-light.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "minutes-1440-light-after.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("tab", { name: /Minutes|Протокол/ }).click();
    await expect(page.locator("[data-minutes='item']").first()).toBeVisible();
    const mobileBody = await page
      .locator("[data-minutes='item'] .dy-item__body")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(mobileBody).toBeGreaterThanOrEqual(200);
    await page.screenshot({
      path: path.join(SHOT_ROOT, "minutes-375-light-after.png"),
      fullPage: true,
    });
  });
});
