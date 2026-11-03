import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-040");
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

test.describe("T-040 nothing lost", () => {
  test.describe.configure({ mode: "serial" });

  test("quota too short → message, no upload request", async ({ page }) => {
    test.setTimeout(60_000);

    let uploadCalls = 0;
    await page.route("**/api/media**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (
        method === "POST" &&
        (url.includes("/upload-intent") ||
          /\/api\/media\/?$/.test(url.split("?")[0] ?? ""))
      ) {
        uploadCalls += 1;
      }
      await route.continue();
    });

    // Desktop (D7): no quota-hint beside upload — block still works.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await ensureSignedIn(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible();
    await expect(page.locator("[data-recordings='quota-hint']")).toHaveCount(0);
    await page.evaluate(() => {
      const w = window as unknown as {
        __dictablyForceDurationMs?: number;
        __dictablyForceBalanceSeconds?: number;
      };
      w.__dictablyForceDurationMs = 74 * 60 * 1000;
      w.__dictablyForceBalanceSeconds = 60;
    });

    await page.locator("[data-recordings='file']").setInputFiles({
      name: `t040-quota-${Date.now()}.wav`,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    const cont = page.locator("[data-recordings='upload-details-continue']");
    await expect(cont).toBeVisible({ timeout: 8_000 });
    await cont.click();
    await expect(page.locator("[data-recordings='error']")).toContainText(
      /74|хв|min/i,
      { timeout: 10_000 },
    );
    expect(uploadCalls).toBe(0);

    // Phone: quota hint visible when balance > 0 (T-045 B1 / D7).
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
      const w = window as unknown as { __dictablyForceBalanceSeconds?: number };
      delete w.__dictablyForceBalanceSeconds;
    });
    await page.reload();
    await ensureSignedIn(page);
    await expect(page.locator("[data-recordings='quota-hint']")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("offline banner appears and clears", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible();

    await context.setOffline(true);
    await expect(page.locator("[data-offline='banner']")).toBeVisible({
      timeout: 5_000,
    });
    await context.setOffline(false);
    await expect(page.locator("[data-offline='banner']")).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("draft title survives reload", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/app/");
    await ensureSignedIn(page);
    const name = `t040-draft-${Date.now()}.wav`;
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

    const id = new URL(page.url()).searchParams.get("id");
    expect(id).toBeTruthy();

    await page.locator("[data-recording='more']").click();
    await page.locator("[data-recording='rename-title']").click();
    await page
      .locator("[data-recording='title-input']")
      .fill("Draft title survive");
    await expect
      .poll(async () =>
        page.evaluate(
          (mediaId) => localStorage.getItem(`dictably.draft.${mediaId}`),
          id!,
        ),
      )
      .toContain("Draft title survive");

    await page.reload();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });
    const raw = await page.evaluate(
      (mediaId) => localStorage.getItem(`dictably.draft.${mediaId}`),
      id!,
    );
    expect(raw).toContain("Draft title survive");
  });

  test("gone 404 state + axe + shots", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page);
    await page.goto("/app/r/?id=00000000-0000-4000-8000-000000000099");
    await expect(page.locator("[data-recording-gone]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-recording='gone-back']")).toBeVisible();

    for (const width of [375, 1440] as const) {
      for (const dark of [false, true]) {
        await page.setViewportSize({
          width,
          height: width === 375 ? 812 : 900,
        });
        await setTheme(page, dark ? "dark" : "light");
        await page.screenshot({
          path: path.join(
            SHOT_ROOT,
            `gone-${width}-${dark ? "dark" : "light"}.png`,
          ),
          fullPage: true,
        });
      }
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
