import type { Page } from "@playwright/test";
import path from "node:path";

const ROOT = path.join("e2e", "__screenshots__", "T-000a.1");

export const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export async function shot(
  page: Page,
  opts: {
    locale: "en" | "uk";
    viewport: (typeof VIEWPORTS)[number]["name"];
    scheme: "light" | "dark";
  },
) {
  const file = path.join(
    ROOT,
    `${opts.locale}-${opts.viewport}-${opts.scheme}.png`,
  );
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
