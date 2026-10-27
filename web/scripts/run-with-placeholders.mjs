import { spawnSync } from "node:child_process";

process.env.DICTABLY_ALLOW_PLACEHOLDER_ENV = "1";
const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node scripts/run-with-placeholders.mjs <cmd> [args...]");
  process.exit(1);
}
const [cmd, ...rest] = args;
const result = spawnSync(cmd, rest, { stdio: "inherit", shell: true, env: process.env });
process.exit(result.status ?? 1);
