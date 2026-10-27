import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
if (!files.includes("en.json")) {
  console.error("messages/en.json missing");
  process.exit(1);
}

function flatten(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flatten(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

const en = JSON.parse(readFileSync(path.join(dir, "en.json"), "utf8"));
const enKeys = new Set(flatten(en));
let failed = false;

for (const file of files) {
  if (file === "en.json") continue;
  const data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const keys = new Set(flatten(data));
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`i18n keys mismatch in ${file}`);
    if (missing.length) console.error("  missing:", missing.join(", "));
    if (extra.length) console.error("  extra:", extra.join(", "));
  }
}

if (failed) process.exit(1);
console.log("i18n keys: ok (", files.length, "locales)");
