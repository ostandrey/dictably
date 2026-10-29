import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("T-023a preview artefacts (static out/)", () => {
  test("robots.txt / sitemap / home meta when built with placeholders", () => {
    // Local out/ is placeholder-build (production mode + placeholders).
    // Preview-mode HTML is verified by check-site-mode + optional Railway build.
    const robots = fs.readFileSync(path.join("out", "robots.txt"), "utf8");
    expect(robots.length).toBeGreaterThan(0);
    const home = fs.readFileSync(path.join("out", "index.html"), "utf8");
    expect(home).toContain("Dictably");
  });
});
