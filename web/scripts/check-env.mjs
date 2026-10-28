/**
 * Fail production builds without contact + controller.
 * Local/e2e: DICTABLY_ALLOW_PLACEHOLDER_ENV=1
 */
const allow = process.env.DICTABLY_ALLOW_PLACEHOLDER_ENV === "1";
if (allow) {
  console.log("check-env: placeholders allowed (DICTABLY_ALLOW_PLACEHOLDER_ENV=1)");
  process.exit(0);
}

const required = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_CONTROLLER_NAME",
];

const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(
    "check-env: missing required env for production build:\n  " +
      missing.join("\n  ") +
      "\nSee .env.example. For local/e2e set DICTABLY_ALLOW_PLACEHOLDER_ENV=1",
  );
  process.exit(1);
}

console.log("check-env: ok");
