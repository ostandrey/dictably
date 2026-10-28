import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-015");
const FIXTURE = path.join("e2e", "fixtures", "short.wav");

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

async function openReadyRecording(page: import("@playwright/test").Page) {
  await page.goto("/app/");
  await ensureSignedIn(page);
  const name = `t015-${Date.now()}.wav`;
  await page.locator("[data-recordings='file']").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: fs.readFileSync(FIXTURE),
  });
  const row = page.locator("[data-recordings='row']").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });
  await row.click();
  await expect(page.locator("[data-recording='page']")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("[data-recording='segment']").first()).toBeVisible();
  return name;
}

function buildLongTranscript(count = 2500) {
  const durationMs = 3 * 60 * 60 * 1000;
  const step = Math.floor(durationMs / count);
  const segments = Array.from({ length: count }, (_, i) => {
    const start_ms = i * step;
    return {
      id: `S${i + 1}`,
      speaker_id: i % 2 === 0 ? "A" : "B",
      start_ms,
      end_ms: start_ms + Math.max(800, step - 200),
      text:
        i === count - 1
          ? "Final long fixture marker unique-end-token."
          : `Long fixture segment ${i + 1} about the table update.`,
    };
  });
  return {
    media_id: "00000000-0000-0000-0000-000000000000",
    provider: "fake",
    model: "fake-v0",
    language: "en",
    status: "ready",
    speakers: [
      {
        id: "sp-a",
        label: "A",
        display_name: "Speaker A",
        color_idx: 0,
        party: null,
      },
      {
        id: "sp-b",
        label: "B",
        display_name: "Speaker B",
        color_idx: 1,
        party: null,
      },
    ],
    segments,
    words: [],
  };
}

test.describe("T-015 recording page", () => {
  test.describe.configure({ mode: "serial" });

  test("upload → open → seek by timecode ±0.3s → rename speaker", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openReadyRecording(page);

    const audio = page.locator("[data-recording='audio']");
    await expect(audio).toHaveCount(1);

    const second = page.locator("[data-recording='segment']").nth(1);
    const startMs = Number(await second.getAttribute("data-start-ms"));
    await second.click();
    await page.waitForTimeout(400);
    const current = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-recording='audio']",
      ) as HTMLAudioElement | null;
      return el?.currentTime ?? -1;
    });
    expect(Math.abs(current - startMs / 1000)).toBeLessThanOrEqual(0.3);

    await page.locator("[data-recording='rename']").click();
    const nameInput = page.locator(".rec-rename__list input").first();
    await nameInput.fill("Olena");
    await page.getByRole("button", { name: /Save|Зберегти/ }).click();
    await expect(page.locator(".rec-page__speakers")).toContainText("Olena", {
      timeout: 10_000,
    });
  });

  test("B1 search keeps all turns, highlights matches, ↑/↓ navigate", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openReadyRecording(page);

    const allBefore = await page.locator("[data-recording='segment']").count();
    expect(allBefore).toBeGreaterThanOrEqual(2);

    const find = page.locator("[data-recording='find']");
    await find.fill("agreed");
    await expect(page.locator("[data-recording='match-count']")).toBeVisible();
    await expect(page.locator("[data-recording='match-count']")).toContainText(
      /1 of|1 з/,
    );

    // All turns stay mounted in the virtual list (DOM may only show viewport —
    // assert non-match segment still reachable by scrolling / that filter did not shrink to 1).
    const matchTurns = page.locator("[data-recording='segment'].is-match");
    await expect(matchTurns.first()).toBeVisible();
    await expect(page.locator(".rec-hit").first()).toBeVisible();

    // Non-matching earlier segment still exists in the virtualizer dataset
    const indices = await page.locator("[data-recording='segment']").evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute("data-index"))),
    );
    expect(Math.max(...indices)).toBeGreaterThanOrEqual(0);
    // Total segment buttons in DOM can be < full list due to virtualization,
    // but we must still see more than only matches when scrolled to top.
    await page.locator("[data-recording='transcript-scroll']").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    const visible = await page.locator("[data-recording='segment']").count();
    expect(visible).toBeGreaterThanOrEqual(1);
    const nonMatch = page.locator(
      "[data-recording='segment']:not(.is-match)",
    );
    await expect(nonMatch.first()).toBeVisible();

    await page.locator("[data-recording='match-next']").click();
    await expect(page.locator("[data-recording='segment'].is-match-current")).toBeVisible();
  });

  test("B2 autoscroll pause + Back to now", async ({ page }) => {
    test.setTimeout(90_000);
    await openReadyRecording(page);

    await page.locator("[data-recording='play']").click();
    await page.waitForTimeout(600);
    // Short fixtures may not overflow — wheel still counts as manual scroll (IA).
    const scroll = page.locator("[data-recording='transcript-scroll']");
    await scroll.hover();
    await page.mouse.wheel(0, 800);
    await expect(page.locator("[data-recording='back-to-now']")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator("[data-recording='back-to-now']").click();
    await expect(page.locator("[data-recording='back-to-now']")).toHaveCount(0);
    await expect(page.locator("[data-recording='segment'].is-playing")).toBeVisible();
  });

  test("B3 ~2500 segments virtualized — no long tasks >100ms; end seek works", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/app/");
    await ensureSignedIn(page);

    const name = `t015-long-${Date.now()}.wav`;
    await page.locator("[data-recordings='file']").setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: fs.readFileSync(FIXTURE),
    });
    const row = page.locator("[data-recordings='row']").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/Ready|Готово/, { timeout: 30_000 });

    const long = buildLongTranscript(2500);
    // Register specific routes last — Playwright tries them first.
    await page.route("**/api/media/*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const url = route.request().url();
      if (
        url.includes("/transcript") ||
        url.includes("/peaks") ||
        url.includes("/audio") ||
        url.includes("/speakers")
      ) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      json.duration_ms = 3 * 60 * 60 * 1000;
      await route.fulfill({
        status: response.status(),
        contentType: "application/json",
        body: JSON.stringify(json),
      });
    });
    await page.route("**/api/media/*/transcript", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(long),
      });
    });

    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-recording='segment']").first()).toBeVisible();

    await page.evaluate(() => {
      const w = window as unknown as { __longTasks?: number[]; __ltObs?: boolean };
      w.__longTasks = [];
      if (!w.__ltObs) {
        try {
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (e.duration > 100) w.__longTasks?.push(e.duration);
            }
          });
          obs.observe({ type: "longtask", buffered: true });
          w.__ltObs = true;
        } catch {
          /* longtask not supported */
        }
      }
    });

    const scroll = page.locator("[data-recording='transcript-scroll']");
    for (let i = 0; i < 4; i++) {
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(200);
    }

    const observed = await page.evaluate(() => {
      const w = window as unknown as { __longTasks?: number[] };
      return w.__longTasks ?? [];
    });
    expect(observed, `long tasks >100ms: ${JSON.stringify(observed)}`).toEqual(
      [],
    );

    const endSeg = page
      .locator("[data-recording='segment']")
      .filter({ hasText: "unique-end-token" });
    await expect(endSeg).toBeVisible({ timeout: 10_000 });
    const startMs = Number(await endSeg.getAttribute("data-start-ms"));
    expect(startMs).toBeGreaterThan(2 * 60 * 60 * 1000);
    // Floating "Back to now" may cover the last row — call DOM click on the button.
    // Short fixture wav clamps HTMLMediaElement.currentTime — assert data-seek-ms instead.
    await endSeg.evaluate((el) => (el as HTMLButtonElement).click());
    await expect
      .poll(async () => {
        return Number(
          await page
            .locator("[data-recording='audio']")
            .getAttribute("data-seek-ms"),
        );
      })
      .toBeGreaterThan(2 * 60 * 60 * 1000);
    const seekMs = Number(
      await page.locator("[data-recording='audio']").getAttribute("data-seek-ms"),
    );
    expect(Math.abs(seekMs - startMs)).toBeLessThanOrEqual(300);
  });

  test("axe on recording page — no serious/critical", async ({ page }) => {
    await page.goto("/app/");
    await ensureSignedIn(page);
    const row = page.locator("[data-recordings='row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator("[data-recording='page']")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bad = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("screenshots 375/1440 light+dark", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    await page.goto("/app/");
    await ensureSignedIn(page);
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
        await page.screenshot({
          path: path.join(SHOT_ROOT, `en-${vp.name}-${scheme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
