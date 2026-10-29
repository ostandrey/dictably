import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Confirm optional upload-details dialog (T-035 B2) if it appears. */
export async function confirmUploadDetailsIfOpen(page: Page) {
  const details = page.locator("[data-recordings='upload-details']");
  try {
    await details.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    return;
  }
  await page.locator("[data-recordings='upload-details-continue']").click();
  await expect(details).toHaveCount(0, { timeout: 10_000 });
}
