import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ensureSignedIn, uniqueE2eEmail } from "./utils/auth";
import { recordingRow } from "./utils/recordings";
import { confirmUploadDetailsIfOpen } from "./utils/upload";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-017");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");
const SUITE_EMAIL = uniqueE2eEmail("t017");

test.describe("T-017 exports", () => {
  test.describe.configure({ mode: "serial" });

  test("download minutes DOCX + PDF", async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await ensureSignedIn(page, { email: SUITE_EMAIL });
    const name = `t017-${Date.now()}.wav`;
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
    await expect(page.locator("[data-recording='export']")).toBeVisible();

    await page.locator("[data-recording='export']").click();
    await expect(page.locator("[data-recording='export-menu']")).toBeVisible();

    const docxWait = page.waitForEvent("download");
    await page.locator("[data-export='minutes-docx']").click();
    const docx = await docxWait;
    expect(docx.suggestedFilename()).toMatch(/\.docx$/i);
    const docxPath = await docx.path();
    expect(docxPath).toBeTruthy();
    const docxBuf = fs.readFileSync(docxPath!);
    expect(docxBuf.subarray(0, 2).toString()).toBe("PK");

    // PDF needs WeasyPrint (Pango/Cairo). On Windows without GTK the API returns 503 —
    // samples are generated in Docker (`minutes-uk.pdf` / `minutes-en.pdf`).
    await page.locator("[data-recording='export']").click();
    await expect(page.locator("[data-recording='export-menu']")).toBeVisible();
    const pdfRespPromise = page.waitForResponse(
      (r) => r.url().includes("/export?") && r.url().includes("format=pdf"),
    );
    const pdfWait = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
    await page.locator("[data-export='minutes-pdf']").click();
    const pdfResp = await pdfRespPromise;
    if (pdfResp.status() === 200) {
      const pdf = await pdfWait;
      expect(pdf).toBeTruthy();
      expect(pdf!.suggestedFilename()).toMatch(/\.pdf$/i);
      const pdfPath = await pdf!.path();
      expect(pdfPath).toBeTruthy();
      const pdfBuf = fs.readFileSync(pdfPath!);
      expect(pdfBuf.subarray(0, 4).toString()).toBe("%PDF");
    } else {
      expect(pdfResp.status()).toBe(503);
    }

    const url = page.url();
    const mediaId =
      new URL(url).searchParams.get("id") ||
      url.match(
        /\/(?:uk\/)?app\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )?.[1];
    expect(mediaId).toBeTruthy();
    // Anonymous probe via static host proxy (API process may not expose :8000 to request fixture).
    const anon = await request.get(
      `/api/media/${mediaId}/export?kind=minutes&format=docx`,
    );
    expect([401, 403]).toContain(anon.status());
  });

  test("screenshots export menu 375/1440 light+dark", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page, { email: SUITE_EMAIL });
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible();

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
          await page.locator("[data-recording='share']").click();
          await expect(page.locator("[data-recording='share-sheet']")).toBeVisible();
        } else {
          if (!(await page.locator("[data-recording='export-menu']").isVisible())) {
            await page.locator("[data-recording='export']").click();
            await expect(page.locator("[data-recording='export-menu']")).toBeVisible();
          }
        }
        await page.screenshot({
          path: path.join(SHOT_ROOT, `export-menu-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
        if (vp.width <= 400) {
          await page.locator("[data-sheet='close']").click();
        }
      }
    }
  });
});
