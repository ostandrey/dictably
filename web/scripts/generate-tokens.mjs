/**
 * Generate src/styles/tokens.css from docs/design/system/tokens.json (T-004).
 * Run: pnpm tokens
 *
 * Selectors:
 *   :root                                              → teal · light
 *   :root[data-accent="tomato"]                        → tomato · light
 *   :root[data-theme="dark"]                           → teal · dark
 *   :root[data-theme="dark"][data-accent="tomato"]     → tomato · dark
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcJson = path.resolve(root, "../docs/design/system/tokens.json");
const outCss = path.resolve(root, "src/styles/tokens.css");

const data = JSON.parse(fs.readFileSync(srcJson, "utf8"));

function cssVar(name) {
  return `--${name}`;
}

function block(selector, decls) {
  const body = decls.map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `${selector} {\n${body}\n}\n`;
}

const themes = ["light", "dark", "tomato", "tomato-dark"];
const byTheme = Object.fromEntries(themes.map((t) => [t, []]));

for (const tok of data.color.tokens) {
  for (const theme of themes) {
    const v = tok.value[theme];
    if (v == null) continue;
    byTheme[theme].push([cssVar(tok.name), v]);
  }
}

for (const tok of data.shadow.tokens) {
  for (const theme of themes) {
    const v = tok.value[theme];
    if (v == null) continue;
    byTheme[theme].push([cssVar(tok.name), v]);
  }
}

const shared = [];
for (const tok of data.spacing.tokens) {
  shared.push([cssVar(tok.name), tok.value]);
}
for (const tok of data.radius.tokens) {
  shared.push([cssVar(tok.name), tok.value]);
}
for (const tok of data.duration.tokens) {
  shared.push([cssVar(tok.name), tok.value]);
}

shared.push([
  "--font-sans",
  'var(--font-onest), "Onest", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
]);
shared.push(["--ease", "cubic-bezier(.2,.8,.2,1)"]);

for (const group of data.type.groups) {
  for (const style of group.styles) {
    shared.push([`--text-${style.name}-size`, style.fontSize]);
    shared.push([`--text-${style.name}-line`, style.lineHeight]);
    shared.push([`--text-${style.name}-weight`, String(style.fontWeight)]);
    if (style.letterSpacing) {
      shared.push([`--text-${style.name}-tracking`, style.letterSpacing]);
    }
  }
}

// Temporary aliases while landing/app CSS migrates off DESIGN.md names (T-004).
shared.push(["--paper", "var(--canvas)"]);
shared.push(["--muted", "var(--ink-muted)"]);
shared.push(["--rule", "var(--line)"]);
shared.push(["--accent-fill", "var(--accent)"]);
shared.push(["--accent-text", "var(--accent)"]);
shared.push(["--accent-ink", "var(--on-accent)"]);
shared.push(["--font-serif", "var(--font-sans)"]);
shared.push([
  "--font-mono",
  'ui-monospace, "Cascadia Code", "SFMono-Regular", Menlo, Consolas, monospace',
]);
shared.push(["--text-xs", "var(--text-caption-size)"]);
shared.push(["--text-sm", "var(--text-body-size)"]);
shared.push(["--text-base", "var(--text-reading-size)"]);
shared.push(["--text-lg", "var(--text-heading-size)"]);
shared.push(["--text-xl", "var(--text-title-size)"]);
shared.push(["--text-2xl", "var(--text-display-size)"]);
shared.push(["--text-3xl", "var(--text-display-xl-size)"]);
shared.push(["--dur", "var(--duration-base)"]);
shared.push(["--space", "var(--space-1)"]);

const header = `/* AUTO-GENERATED from docs/design/system/tokens.json — do not edit by hand.
 * Regenerate: pnpm tokens
 */

`;

const parts = [header];

parts.push(
  block(":root", [...byTheme.light, ...shared, ["color-scheme", "light"]]),
);
parts.push(block(':root[data-accent="tomato"]', byTheme.tomato));
parts.push(
  block(':root[data-theme="dark"]', [...byTheme.dark, ["color-scheme", "dark"]]),
);
parts.push(
  block(':root[data-theme="dark"][data-accent="tomato"]', [
    ...byTheme["tomato-dark"],
    ["color-scheme", "dark"],
  ]),
);

const typeUtils = [];
for (const group of data.type.groups) {
  for (const style of group.styles) {
    const tracking = style.letterSpacing
      ? ` letter-spacing: ${style.letterSpacing};`
      : "";
    typeUtils.push(
      `.dy-type-${style.name} { font: ${style.fontWeight} ${style.fontSize}/${style.lineHeight} var(--font-sans);${tracking} }`,
    );
  }
}
parts.push("\n/* Type scale */\n" + typeUtils.join("\n") + "\n");

fs.mkdirSync(path.dirname(outCss), { recursive: true });
fs.writeFileSync(outCss, parts.join("\n"), "utf8");
console.log(`Wrote ${path.relative(root, outCss)}`);
