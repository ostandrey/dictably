/**
 * Generate web/src/lib/api from backend OpenAPI.
 * Run from web/: pnpm gen:api  (or just gen:api from repo root)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const backendRoot = path.join(webRoot, "..", "backend");
const outDir = path.join(webRoot, "src", "lib", "api");
const schemaPath = path.join(outDir, "openapi.json");
const typesPath = path.join(outDir, "schema.d.ts");

mkdirSync(outDir, { recursive: true });

const dump = spawnSync(
  "uv",
  ["run", "python", "scripts/export_openapi.py"],
  { cwd: backendRoot, encoding: "utf8", shell: true },
);
if (dump.status !== 0) {
  console.error(dump.stderr || dump.stdout || "export_openapi failed");
  process.exit(dump.status ?? 1);
}
writeFileSync(schemaPath, dump.stdout);
console.log("wrote", path.relative(webRoot, schemaPath));

const gen = spawnSync(
  "pnpm",
  ["exec", "openapi-typescript", schemaPath, "-o", typesPath],
  { cwd: webRoot, encoding: "utf8", shell: true, stdio: "inherit" },
);
if (gen.status !== 0) process.exit(gen.status ?? 1);
console.log("wrote", path.relative(webRoot, typesPath));
