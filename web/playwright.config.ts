import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = process.env.DICTABLY_API_PROXY || "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  /* Always tear down webServers Playwright started (S2 — free :8000). */
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      // Wrapper so the API child dies with the Playwright process.
      command: "node scripts/e2e-api.mjs",
      url: `${apiURL.replace(/\/$/, "")}/api/health`,
      // Never reuse a stray uvicorn — Owner Docker stack must own :8000 when needed.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        ENV: "test",
        DEV_LOGIN: "1",
        COOKIE_SECURE: "0",
        PUBLIC_APP_URL: baseURL,
        ASR_PROVIDER: "fake",
        LLM_PROVIDER: "fake",
        AUTH_RATE_LIMIT_PER_MINUTE: "1000",
      },
    },
    {
      command: "node scripts/e2e-serve.mjs",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        E2E_PORT: String(port),
        DICTABLY_API_PROXY: apiURL,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
