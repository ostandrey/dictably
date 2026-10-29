/**
 * Site-wide marketing config. All NEXT_PUBLIC_* are resolved at build time.
 * Production / Railway builds must set required vars (see scripts/check-env.mjs).
 */

export type SiteMode = "preview" | "production";

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

/** Default production. Preview skips contact/controller at build (T-023a). */
export const siteMode: SiteMode =
  process.env.NEXT_PUBLIC_SITE_MODE?.trim() === "preview"
    ? "preview"
    : "production";

export const isPreview = siteMode === "preview";

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

function contactOrPreview(value: string | undefined, placeholder: string): string {
  const v = value?.trim() ?? "";
  if (v) return v;
  if (isPreview) return "";
  if (allowPlaceholder) return placeholder;
  return required("NEXT_PUBLIC_CONTACT_EMAIL", v);
}

function controllerOrPreview(
  value: string | undefined,
  placeholder: string,
): string {
  const v = value?.trim() ?? "";
  if (v) return v;
  if (isPreview) return "Dictably (test version, pre-launch)";
  if (allowPlaceholder) return placeholder;
  return required("NEXT_PUBLIC_CONTROLLER_NAME", v);
}

export const site = {
  name: "Dictably",
  mode: siteMode,
  isPreview,
  url: envOrPlaceholder(
    "NEXT_PUBLIC_SITE_URL",
    process.env.NEXT_PUBLIC_SITE_URL,
    "http://127.0.0.1:4173",
  ).replace(/\/$/, ""),
  contactEmail: contactOrPreview(
    process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    "dev-only@localhost",
  ),
  controller: controllerOrPreview(
    process.env.NEXT_PUBLIC_CONTROLLER_NAME,
    "[CONTROLLER — set NEXT_PUBLIC_CONTROLLER_NAME]",
  ),
  /** Bump manually when privacy copy changes (F3). */
  privacyUpdated: "2026-10-28",
  /** Hero signature autoplay (T-000a.2). Flip to false to disable without code edits. */
  heroAutoplay: true,
  cloudflareBeacon: process.env.NEXT_PUBLIC_CF_BEACON?.trim() ?? "",
} as const;

export type Locale = "en" | "uk";

export function localePath(locale: Locale, path = ""): string {
  const base = locale === "uk" ? "/uk" : "";
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${base}${p || "/"}`.replace(/\/?$/, "/");
}

/** Merge into page metadata when SITE_MODE=preview. */
export const previewRobots = {
  index: false,
  follow: false,
} as const;
