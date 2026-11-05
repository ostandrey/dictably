/**
 * Start uvicorn for Playwright and exit the child when this process exits (S2).
 * Ensures :8000 is not left behind after e2e.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(__dirname, "..", "..", "backend");
const port = process.env.E2E_API_PORT || "8000";

/**
 * T-047 N1: explicit soft-ffmpeg flag (not PATH filtering). Fake ASR timings
 * assume multi-second media; real ffmpeg on short.wav (~1s) breaks seek e2e.
 */
const child = spawn(
  "uv",
  ["run", "uvicorn", "dictably.main:app", "--host", "127.0.0.1", "--port", port],
  {
    cwd: backend,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DICTABLY_E2E_SOFT_FFMPEG: "1",
    },
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
