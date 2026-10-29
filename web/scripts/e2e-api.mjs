/**
 * Start uvicorn for Playwright and exit the child when this process exits (S2).
 * Ensures :8000 is not left behind after e2e.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, "..", "..", "backend");

const child = spawn(
  "uv",
  ["run", "uvicorn", "dictably.main:app", "--host", "127.0.0.1", "--port", "8000"],
  {
    cwd: backend,
    stdio: "inherit",
    shell: true,
    env: process.env,
  },
);

function shutdown(code = 0) {
  if (!child.killed) {
    child.kill("SIGTERM");
    // Windows: ensure kill
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));
process.on("exit", () => {
  if (!child.killed) child.kill();
});
