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
 * Fake ASR uses fixed multi-second timings on tiny fixtures. Real ffmpeg would
 * convert short.wav to ~1s playback and break seek e2e (±0.3s). Keep ENV=test
 * soft stubs by hiding ffmpeg/ffprobe from the API child PATH.
 */
function pathWithoutFfmpeg(rawPath) {
  const sep = path.delimiter;
  return (rawPath || "")
    .split(sep)
    .filter((entry) => {
      const lower = entry.toLowerCase();
      return !lower.includes("ffmpeg") && !lower.includes("ffprobe");
    })
    .join(sep);
}

const child = spawn(
  "uv",
  ["run", "uvicorn", "dictably.main:app", "--host", "127.0.0.1", "--port", port],
  {
    cwd: backend,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      PATH: pathWithoutFfmpeg(process.env.PATH),
      Path: pathWithoutFfmpeg(process.env.Path || process.env.PATH),
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
