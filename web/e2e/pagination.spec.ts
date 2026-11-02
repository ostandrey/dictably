import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { passAccountGates } from "./utils/auth";

const backendRoot = path.resolve(process.cwd(), "..", "backend");
const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-039");
const CACHE_KEY = "dictably.recordingsList.v2";

function seedMany(email: string, n: number, prefix?: string) {
  execFileSync(
    "uv",
    ["run", "python", "scripts/seed_media_page.py", email, String(n)],
    {
      cwd: backendRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        ENV: "test",
        DEV_LOGIN: "1",
        COOKIE_SECURE: "0",
        SEED_MEDIA_EMAIL: email,
        SEED_MEDIA_COUNT: String(n),
        ...(prefix ? { SEED_MEDIA_PREFIX: prefix } : {}),
      },
    },
  );
}

async function forceTheme(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.evaluate((dark) => {
    const root = document.documentElement;
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, scheme === "dark");
}

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "dictably_csrf")?.value;
  expect(csrf).toBeTruthy();
  return { "X-CSRF-Token": csrf! };
}

async function rowTitles(page: Page): Promise<string[]> {
  return page.locator("[data-recordings='row'] .dy-rec__title").allTextContents();
}

async function loginAs(page: Page, email: string, name: string) {
  await page.goto("/app/");
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
    "[data-consent='accept'], [data-recordings='panel'], [data-onboarding='skip']",
    { timeout: 15_000 },
  );
  await passAccountGates(page);
  await expect(page.locator("[data-dialog='open']")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.locator("[data-recordings='panel']")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("T-039 pagination", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await page.evaluate((key) => {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem("dictably.recordingsList.v1");
    }, CACHE_KEY);
  });

  test("Show more + scroll restore + SWR + empty search shots", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_ROOT, { recursive: true });
    const email = `shots-${Date.now()}@example.com`;
    await loginAs(page, email, "Shots User");
    seedMany(email, 45);

    const listed = await page.request.get("/api/media?limit=20");
    expect(listed.ok()).toBeTruthy();
    expect(((await listed.json()) as { items: unknown[] }).items.length).toBe(
      20,
    );

    await page.reload();
    await page.waitForSelector("[data-recordings='panel']", { timeout: 15_000 });
    await passAccountGates(page);
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0);
    await expect(page.locator("[data-recordings='error']")).toHaveCount(0);
    await expect(page.locator("[data-recordings='row']")).toHaveCount(20, {
      timeout: 15_000,
    });
    await expect(page.locator("[data-recordings='show-more']")).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await forceTheme(page, "light");
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-375-light.png"),
      fullPage: true,
    });
    await forceTheme(page, "dark");
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-375-dark.png"),
      fullPage: true,
    });

    await page.locator("[data-recordings='show-more']").click();
    await expect(page.locator("[data-recordings='row']")).toHaveCount(40, {
      timeout: 15_000,
    });
    const firstTitle = page
      .locator("[data-recordings='row'] a.dy-rec__title")
      .first();
    await expect(firstTitle).toBeVisible();
    const scrollBefore = 400;
    await page.evaluate(
      ({ y, key }) => {
        window.scrollTo(0, y);
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const cached = JSON.parse(raw) as { scrollY: number };
        cached.scrollY = y;
        sessionStorage.setItem(key, JSON.stringify(cached));
      },
      { y: scrollBefore, key: CACHE_KEY },
    );
    await firstTitle.click();
    await expect(page).toHaveURL(/\/app\/r\/?/);

    const freshPrefix = `swr-fresh-${Date.now()}`;
    seedMany(email, 1, freshPrefix);

    await page.goBack();
    await passAccountGates(page);
    await expect
      .poll(async () => page.locator("[data-recordings='row']").count(), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(40);
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: freshPrefix }),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 5_000 })
      .toBeGreaterThan(scrollBefore - 80);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(120);

    await page.setViewportSize({ width: 1440, height: 900 });
    await forceTheme(page, "dark");
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-1440-dark.png"),
      fullPage: true,
    });
    await forceTheme(page, "light");
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-1440-light.png"),
      fullPage: true,
    });

    while (await page.locator("[data-recordings='show-more']").isVisible()) {
      await page.locator("[data-recordings='show-more']").click();
      await page.waitForTimeout(400);
    }
    await expect(page.locator("[data-recordings='all-done']")).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-all-done.png"),
      fullPage: true,
    });

    await page.locator("[data-recordings='search']").fill("zzznomatch999");
    await expect(page.locator("[data-recordings='clear-search']")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: path.join(SHOT_ROOT, "list-search-empty.png"),
      fullPage: true,
    });
  });

  test("B3: soft merge keeps all prior rows; delete removes one", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `b3-${Date.now()}@example.com`;
    await loginAs(page, email, "B3 User");
    seedMany(email, 25, "b3-seed");

    await page.reload();
    await passAccountGates(page);
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0);
    await expect(page.locator("[data-recordings='row']")).toHaveCount(20, {
      timeout: 15_000,
    });
    await page.locator("[data-recordings='show-more']").click();
    await expect(page.locator("[data-recordings='row']")).toHaveCount(25, {
      timeout: 15_000,
    });

    const beforeTitles = await rowTitles(page);
    expect(beforeTitles.length).toBe(25);
    const survivor = beforeTitles[beforeTitles.length - 1]!;
    expect(survivor).toContain("b3-seed");

    const firstTitle = page
      .locator("[data-recordings='row'] a.dy-rec__title")
      .first();
    await firstTitle.click();
    await expect(page).toHaveURL(/\/app\/r\/?/);

    const freshPrefix = `b3-new-${Date.now()}`;
    seedMany(email, 1, freshPrefix);

    await page.goBack();
    await passAccountGates(page);
    await expect
      .poll(async () => page.locator("[data-recordings='row']").count(), {
        timeout: 15_000,
      })
      .toBe(26);
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: freshPrefix }),
    ).toBeVisible();
    for (const title of beforeTitles) {
      await expect(
        page.locator("[data-recordings='row']").filter({ hasText: title }),
      ).toHaveCount(1);
    }
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: survivor }),
    ).toBeVisible();

    // Delete a first-page neighbour (2nd row); soft revalidate must drop it.
    const second = page.locator("[data-recordings='row']").nth(1);
    const deletedTitle = (
      await second.locator(".dy-rec__title").textContent()
    )?.trim();
    expect(deletedTitle).toBeTruthy();
    const href = await second.locator("a.dy-rec__title").getAttribute("href");
    const deletedId = new URL(href!, "http://127.0.0.1").searchParams.get("id");
    expect(deletedId).toBeTruthy();
    const neighbour = (
      await page
        .locator("[data-recordings='row']")
        .nth(2)
        .locator(".dy-rec__title")
        .textContent()
    )?.trim();

    // Snapshot full list cache before delete so remount soft-merges against it.
    await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key);
      if (!raw) throw new Error("missing list cache");
      const cached = JSON.parse(raw) as { items: unknown[] };
      if (cached.items.length < 26) {
        throw new Error(`cache too short: ${cached.items.length}`);
      }
    }, CACHE_KEY);
    const cacheSnap = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      CACHE_KEY,
    );

    const headers = await csrfHeaders(page);
    const del = await page.request.delete(`/api/media/${deletedId}`, {
      headers,
    });
    expect(del.ok()).toBeTruthy();

    await page.evaluate(
      ({ key, snap }) => {
        sessionStorage.setItem(key, snap!);
      },
      { key: CACHE_KEY, snap: cacheSnap },
    );
    await page.goto("/app/");
    await passAccountGates(page);
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0);

    await expect
      .poll(async () => page.locator("[data-recordings='row']").count(), {
        timeout: 15_000,
      })
      .toBe(25);
    await expect(
      page
        .locator("[data-recordings='row']")
        .filter({ hasText: deletedTitle! }),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-recordings='row']").filter({ hasText: survivor }),
    ).toBeVisible();
    if (neighbour) {
      await expect(
        page.locator("[data-recordings='row']").filter({ hasText: neighbour }),
      ).toBeVisible();
    }
  });

  test("B4: other user never sees previous user's cached rows", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const emailA = `b4a-${Date.now()}@example.com`;
    const emailB = `b4b-${Date.now()}@example.com`;
    await loginAs(page, emailA, "User A");
    seedMany(emailA, 25, "user-a-only");

    await page.reload();
    await passAccountGates(page);
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0);
    await expect(page.locator("[data-recordings='row']")).toHaveCount(20, {
      timeout: 15_000,
    });
    await page.locator("[data-recordings='show-more']").click();
    await expect(page.locator("[data-recordings='row']")).toHaveCount(25, {
      timeout: 15_000,
    });
    const titlesA = await rowTitles(page);
    expect(titlesA.some((t) => t.includes("user-a-only"))).toBeTruthy();

    // Session ended without Sign out (cookies cleared; sessionStorage remains).
    await page.context().clearCookies();
    await page.goto("/app/");
    await expect(page.locator("[data-auth='dev-login']")).toBeVisible({
      timeout: 15_000,
    });

    await page.evaluate(
      async ({ em }) => {
        await fetch("/api/auth/dev-login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: em, name: "User B" }),
        });
      },
      { em: emailB },
    );
    await page.reload();
    await passAccountGates(page);
    await expect(page.locator("[data-recordings='panel']")).toBeVisible({
      timeout: 15_000,
    });

    // B has no media; A's filenames must never appear.
    await expect(page.locator("[data-recordings='row']")).toHaveCount(0, {
      timeout: 15_000,
    });
    for (const title of titlesA) {
      await expect(
        page.locator("[data-recordings='row']").filter({ hasText: title }),
      ).toHaveCount(0);
    }
    await expect(page.getByText("user-a-only")).toHaveCount(0);

    const cached = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { userId?: string; items?: { filename: string }[] }) : null;
    }, CACHE_KEY);
    if (cached?.items?.length) {
      expect(cached.items.every((i) => !i.filename.includes("user-a-only"))).toBe(
        true,
      );
    }
  });

  test("S6: aborting Show more via search unsticks the button", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const email = `s6-${Date.now()}@example.com`;
    await loginAs(page, email, "S6 User");
    seedMany(email, 25, "s6-seed");
    await page.reload();
    await passAccountGates(page);
    await expect(page.locator("[data-dialog='open']")).toHaveCount(0);
    await expect(page.locator("[data-recordings='row']")).toHaveCount(20, {
      timeout: 15_000,
    });

    await page.route("**/api/media?**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === "GET" && url.searchParams.has("cursor")) {
        await new Promise((r) => setTimeout(r, 2500));
      }
      await route.continue();
    });

    const more = page.locator("[data-recordings='show-more']");
    await more.click();
    await expect(more).toHaveAttribute("aria-busy", "true", { timeout: 2_000 });

    await page.locator("[data-recordings='search']").fill("nope-s6-xyz");
    await expect(page.locator("[data-recordings='clear-search']")).toBeVisible({
      timeout: 10_000,
    });

    await page.locator("[data-recordings='clear-search']").click();
    await expect(page.locator("[data-recordings='row']")).toHaveCount(20, {
      timeout: 15_000,
    });
    await expect(more).toBeVisible();
    await expect(more).not.toHaveAttribute("aria-busy", "true");

    await more.click();
    await expect(page.locator("[data-recordings='row']")).toHaveCount(25, {
      timeout: 15_000,
    });
  });
});
