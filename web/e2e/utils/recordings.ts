import type { Page } from "@playwright/test";

/** Locate a list row by original upload filename (T-041: title is human, not filename). */
export function recordingRow(page: Page, filename: string) {
  return page.locator(`[data-recordings='row'][data-filename="${filename}"]`);
}
