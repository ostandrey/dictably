/** Build-time accent + theme from NEXT_PUBLIC_* (T-004). */

export type Accent = "teal" | "tomato";
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function normalizeAccent(raw: string | undefined): Accent {
  return raw?.trim().toLowerCase() === "tomato" ? "tomato" : "teal";
}

function normalizeTheme(raw: string | undefined): ThemeMode {
  const v = raw?.trim().toLowerCase();
  if (v === "dark" || v === "system") return v;
  return "light";
}

export const siteAccent: Accent = normalizeAccent(process.env.NEXT_PUBLIC_ACCENT);
export const siteThemeMode: ThemeMode = normalizeTheme(process.env.NEXT_PUBLIC_THEME);

/** SSR default when theme=system (client script may flip after paint). */
export function resolvedThemeForSsr(mode: ThemeMode = siteThemeMode): ResolvedTheme {
  return mode === "dark" ? "dark" : "light";
}

export function htmlThemeAttrs(opts?: {
  accent?: Accent;
  themeMode?: ThemeMode;
}): { "data-accent": Accent; "data-theme"?: ResolvedTheme } {
  const accent = opts?.accent ?? siteAccent;
  const mode = opts?.themeMode ?? siteThemeMode;
  const resolved = resolvedThemeForSsr(mode);
  // Always set data-accent; only set data-theme when dark (light = :root default).
  if (resolved === "dark") {
    return { "data-accent": accent, "data-theme": "dark" };
  }
  return { "data-accent": accent };
}
