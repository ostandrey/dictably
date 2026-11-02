import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./utils/auth";
import fs from "node:fs";
import path from "node:path";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-004", "app");

const SAMPLE = {
  empty: [] as const,
  list: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      filename: "Weekly sync with the ministry.m4a",
      title: "Weekly sync with the ministry",
      mime: "audio/mp4",
      size_bytes: 18_432_000,
      duration_ms: 2_412_000,
      status: "ready",
      created_at: "2026-10-14T10:00:00Z",
      meeting_date: "2026-10-14",
      language: "en",
      speaker_count: 2,
      error: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      filename: "Client kickoff.wav",
      title: "Client kickoff",
      mime: "audio/wav",
      size_bytes: 9_100_000,
      duration_ms: 1_800_000,
      status: "ready",
      created_at: "2026-10-12T09:00:00Z",
      meeting_date: "2026-10-12",
      language: "en",
      speaker_count: 2,
      error: null,
    },
  ],
  processing: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      filename: "Board prep.m4a",
      title: null,
      mime: "audio/mp4",
      size_bytes: 22_000_000,
      duration_ms: null,
      status: "processing",
      created_at: "2026-10-28T12:00:00Z",
      meeting_date: null,
      language: null,
      speaker_count: 0,
      error: null,
    },
  ],
};

async function mockMediaList(
  page: import("@playwright/test").Page,
  items: readonly object[],
) {
  await page.unroute("**/api/media**").catch(() => undefined);
  await page.route("**/api/media**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(req.url());
    const pathOnly = url.pathname.replace(/\/$/, "");
    if (pathOnly !== "/api/media") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, next_cursor: null }),
    });
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
  await mockMediaList(page, opts.items);
  await page.evaluate(({ dark }) => {
    const root = document.documentElement;
    root.setAttribute("data-accent", "teal");
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    sessionStorage.removeItem("dictably.recordingsList.v2");
    sessionStorage.removeItem("dictably.recordingsList.v1");
  }, { dark: Boolean(opts.dark) });
  await page.reload();
  await ensureSignedIn(page);
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
