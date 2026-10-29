import { expect, type Page } from "@playwright/test";

/** Complete T-033 consent + onboarding when those dialogs are on screen. */
export async function passAccountGates(page: Page) {
  const consent = page.locator("[data-consent='accept']");
  if (await consent.isVisible()) {
    await consent.click();
    await expect(consent).toHaveCount(0, { timeout: 10_000 });
    const skip = page.locator("[data-onboarding='skip']");
    await skip.waitFor({ state: "visible", timeout: 10_000 });
    await skip.click();
    await expect(skip).toHaveCount(0, { timeout: 10_000 });
    return;
  }
  const skip = page.locator("[data-onboarding='skip']");
  if (await skip.isVisible()) {
    await skip.click();
    await expect(skip).toHaveCount(0, { timeout: 10_000 });
  }
}

/** Dev-login (or reuse session) and clear first-login gates. */
export async function ensureSignedIn(page: Page) {
  await page.waitForSelector(
    "[data-auth='dev-login'], [data-recordings='panel'], [data-consent='accept']",
  );

  if (await page.locator("[data-consent='accept']").isVisible()) {
    await passAccountGates(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });
    return;
  }

  if (await page.locator("[data-recordings='panel']").isVisible()) {
    return;
  }

  await page.locator("[data-auth='dev-login']").click();
  await page.waitForSelector(
    "[data-consent='accept'], [data-recordings='panel'], [data-onboarding='skip']",
    { timeout: 15_000 },
  );
  await passAccountGates(page);
  await expect(page.locator("[data-recordings='panel']")).toBeVisible({
    timeout: 15_000,
  });
}
