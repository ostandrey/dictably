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

/** Unique email so parallel / reused DB runs do not collide (T-041 B4). */
export function uniqueE2eEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Dev-login (or reuse session) and clear first-login gates.
 * Prefer a unique email unless `email` is passed (serial suites that share uploads).
 */
export async function ensureSignedIn(
  page: Page,
  opts?: { email?: string; name?: string; skipOnboarding?: boolean },
) {
  const finishGates = opts?.skipOnboarding !== false;
  await page.waitForSelector(
    "[data-auth='dev-login'], [data-recordings='panel'], [data-settings='panel'], [data-consent='accept']",
  );

  if (await page.locator("[data-consent='accept']").isVisible()) {
    if (finishGates) {
      await passAccountGates(page);
      await expect(
        page.locator("[data-recordings='panel'], [data-settings='panel']").first(),
      ).toBeVisible({
        timeout: 15_000,
      });
    }
    return;
  }

  if (
    (await page.locator("[data-recordings='panel']").isVisible()) ||
    (await page.locator("[data-settings='panel']").isVisible())
  ) {
    return;
  }

  const email = opts?.email ?? uniqueE2eEmail();
  const name = opts?.name ?? "E2E User";
  await page.evaluate(
    async ({ em, nm }) => {
      await fetch("/api/auth/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, name: nm }),
      });
    },
    { em: email, nm: name },
  );
  await page.reload();
  await page.waitForSelector(
    "[data-consent='accept'], [data-recordings='panel'], [data-settings='panel'], [data-onboarding='skip']",
    { timeout: 15_000 },
  );
  if (!finishGates) {
    if (await page.locator("[data-consent='accept']").isVisible()) {
      await page.locator("[data-consent='accept']").click();
      await expect(page.locator("[data-consent='accept']")).toHaveCount(0, {
        timeout: 10_000,
      });
    }
    return;
  }
  await passAccountGates(page);
  await expect(
    page.locator("[data-recordings='panel'], [data-settings='panel']").first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}
