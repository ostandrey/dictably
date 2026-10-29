/**
 * T-023a AC: preview build needs only SITE_URL; production still requires contact+controller.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const checkEnv = path.join(root, "check-env.mjs");

function run(env, expectOk) {
  const r = spawnSync(process.execPath, [checkEnv], {
    env: { ...process.env, ...env, DICTABLY_ALLOW_PLACEHOLDER_ENV: "" },
    encoding: "utf8",
  });
  const ok = r.status === 0;
  if (ok !== expectOk) {
    console.error("check-site-mode FAIL", { env, status: r.status, out: r.stdout, err: r.stderr });
    process.exit(1);
  }
}

run(
  {
    NEXT_PUBLIC_SITE_MODE: "preview",
    NEXT_PUBLIC_SITE_URL: "https://example.com",
  },
  true,
);

run(
  {
    NEXT_PUBLIC_SITE_MODE: "production",
    NEXT_PUBLIC_SITE_URL: "https://example.com",
  },
  false,
);

run(
  {
    NEXT_PUBLIC_SITE_MODE: "production",
    NEXT_PUBLIC_SITE_URL: "https://example.com",
    NEXT_PUBLIC_CONTACT_EMAIL: "a@b.co",
    NEXT_PUBLIC_CONTROLLER_NAME: "FOP Test",
  },
  true,
);

console.log("check-site-mode: ok");
