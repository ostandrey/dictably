import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-004", "app");

const SAMPLE = {
  empty: [] as const,
  list: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      filename: "Weekly sync with the ministry.m4a",
      mime: "audio/mp4",
      size_bytes: 18_432_000,
      duration_ms: 2_412_000,
      status: "ready",
      created_at: "2026-10-14T10:00:00Z",
      error: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      filename: "Client kickoff.wav",
      mime: "audio/wav",
      size_bytes: 9_100_000,
      duration_ms: 1_800_000,
      status: "ready",
      created_at: "2026-10-12T09:00:00Z",
      error: null,
    },
  ],
  processing: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      filename: "Board prep.m4a",
      mime: "audio/mp4",
      size_bytes: 22_000_000,
      duration_ms: null,
      status: "processing",
      created_at: "2026-10-28T12:00:00Z",
      error: null,
    },
  ],
};

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

async function mockMediaList(
  page: import("@playwright/test").Page,
  items: readonly object[],
) {
  await page.unroute("**/api/media").catch(() => undefined);
  await page.route("**/api/media", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items }),
      });
      return;
    }
    await route.continue();
  });
}

async function shotApp(
  page: import("@playwright/test").Page,
  name: string,
  opts: {
    width: number;
    height: number;
    dark?: boolean;
    items: readonly object[];
    wait: string;
  },
) {
  await page.setViewportSize({ width: opts.width, height: opts.height });
  await page.emulateMedia({
    reducedMotion: "reduce",
    colorScheme: opts.dark ? "dark" : "light",
  });
  await mockMediaList(page, opts.items);
  await page.goto("/app/");
  await ensureSignedIn(page);
  await page.evaluate(({ dark }) => {
    const root = document.documentElement;
    root.setAttribute("data-accent", "teal");
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, { dark: Boolean(opts.dark) });
  await expect(page.locator(opts.wait).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: path.join(SHOT_ROOT, `${name}.png`),
    fullPage: true,
  });
}

test.describe("T-004 /app screenshots", () => {
  test("teal-light 375/1440 + teal-dark 1440 — list, empty, processing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });

    const cases: {
      state: "list" | "empty" | "processing";
      items: readonly object[];
      wait: string;
    }[] = [
      { state: "list", items: SAMPLE.list, wait: "[data-recordings='row']" },
      { state: "empty", items: SAMPLE.empty, wait: "[data-recordings='empty']" },
      {
        state: "processing",
        items: SAMPLE.processing,
        wait: "[data-recordings='row']",
      },
    ];

    for (const c of cases) {
      await shotApp(page, `teal-light-375-${c.state}`, {
        width: 375,
        height: 812,
        items: c.items,
        wait: c.wait,
      });
      await shotApp(page, `teal-light-1440-${c.state}`, {
        width: 1440,
        height: 900,
        items: c.items,
        wait: c.wait,
      });
      await shotApp(page, `teal-dark-1440-${c.state}`, {
        width: 1440,
        height: 900,
        dark: true,
        items: c.items,
        wait: c.wait,
      });
    }
  });
});
