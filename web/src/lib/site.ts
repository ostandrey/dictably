/**
 * Site-wide marketing config. All NEXT_PUBLIC_* are resolved at build time.
 * Production / Railway builds must set required vars (see scripts/check-env.mjs).
 */

function required(name: string, value: string | undefined): string {
  const v = value?.trim() ?? "";
  if (!v) {
    throw new Error(
      `Missing ${name}. Set it in .env / Railway build args (see .env.example).`,
    );
  }
  return v;
}

const allowPlaceholder = process.env.DICTABLY_ALLOW_PLACEHOLDER_ENV === "1";

function envOrPlaceholder(
  name: string,
  value: string | undefined,
  placeholder: string,
): string {
  const v = value?.trim() ?? "";
  if (v) return v;
  if (allowPlaceholder) return placeholder;
  return required(name, v);
}

export const site = {
  name: "Dictably",
  url: envOrPlaceholder(
    "NEXT_PUBLIC_SITE_URL",
    process.env.NEXT_PUBLIC_SITE_URL,
    "http://127.0.0.1:4173",
  ).replace(/\/$/, ""),
  contactEmail: envOrPlaceholder(
    "NEXT_PUBLIC_CONTACT_EMAIL",
    process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    "dev-only@localhost",
  ),
  controller: envOrPlaceholder(
    "NEXT_PUBLIC_CONTROLLER_NAME",
    process.env.NEXT_PUBLIC_CONTROLLER_NAME,
    "[CONTROLLER — set NEXT_PUBLIC_CONTROLLER_NAME]",
  ),
  privacyUpdated:
    process.env.NEXT_PUBLIC_PRIVACY_UPDATED?.trim() ||
    new Date().toISOString().slice(0, 10),
  tally: {
    en: envOrPlaceholder(
      "NEXT_PUBLIC_TALLY_FORM_EN",
      process.env.NEXT_PUBLIC_TALLY_FORM_EN,
      "PLACEHOLDER_TALLY_EN",
    ),
    uk: envOrPlaceholder(
      "NEXT_PUBLIC_TALLY_FORM_UK",
      process.env.NEXT_PUBLIC_TALLY_FORM_UK,
      "PLACEHOLDER_TALLY_UK",
    ),
  },
  cloudflareBeacon: process.env.NEXT_PUBLIC_CF_BEACON?.trim() ?? "",
} as const;

export type Locale = "en" | "uk";

export function localePath(locale: Locale, path = ""): string {
  const base = locale === "uk" ? "/uk" : "";
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${base}${p || "/"}`.replace(/\/?$/, "/");
}
