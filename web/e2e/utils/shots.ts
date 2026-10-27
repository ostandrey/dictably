import type { Page } from "@playwright/test";
import path from "node:path";

export const SHOT_ROOT = path.join("e2e", "__screenshots__", "T-000a.2");

export const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export async function shot(
  page: Page,
  opts: {
    locale: "en" | "uk";
    viewport: (typeof VIEWPORTS)[number]["name"] | string;
    scheme: "light" | "dark";
    suffix?: string;
  },
) {
  const name = opts.suffix
    ? `${opts.locale}-${opts.viewport}-${opts.scheme}-${opts.suffix}.png`
    : `${opts.locale}-${opts.viewport}-${opts.scheme}.png`;
  const file = path.join(SHOT_ROOT, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
