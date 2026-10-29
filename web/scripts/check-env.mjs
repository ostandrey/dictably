/**
 * Fail production builds without contact + controller.
 * Preview (NEXT_PUBLIC_SITE_MODE=preview): only SITE_URL required (T-023a).
 * Local/e2e: DICTABLY_ALLOW_PLACEHOLDER_ENV=1
 */
const allow = process.env.DICTABLY_ALLOW_PLACEHOLDER_ENV === "1";
if (allow) {
  console.log("check-env: placeholders allowed (DICTABLY_ALLOW_PLACEHOLDER_ENV=1)");
  process.exit(0);
}

const mode = process.env.NEXT_PUBLIC_SITE_MODE?.trim() || "production";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

if (!siteUrl) {
  console.error(
    "check-env: missing NEXT_PUBLIC_SITE_URL\nSee .env.example.",
  );
  process.exit(1);
}

if (mode === "preview") {
  console.log("check-env: preview mode ok (contact/controller optional)");
  process.exit(0);
}

if (mode !== "production") {
  console.error(
    `check-env: NEXT_PUBLIC_SITE_MODE must be "preview" or "production" (got "${mode}")`,
  );
  process.exit(1);
}

const required = ["NEXT_PUBLIC_CONTACT_EMAIL", "NEXT_PUBLIC_CONTROLLER_NAME"];
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(
    "check-env: missing required env for production build:\n  " +
      missing.join("\n  ") +
      "\nSee .env.example. For preview set NEXT_PUBLIC_SITE_MODE=preview. For local/e2e set DICTABLY_ALLOW_PLACEHOLDER_ENV=1",
  );
  process.exit(1);
}

console.log("check-env: ok (production)");
