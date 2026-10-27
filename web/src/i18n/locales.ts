export type AppLocale = {
  code: string;
  /** Native name for the language switcher */
  name: string;
  hreflang: string;
  ogLocale: string;
  /** Default locale has no URL prefix */
  default?: boolean;
  enabled: boolean;
};

export const locales: AppLocale[] = [
  {
    code: "en",
    name: "English",
    hreflang: "en",
    ogLocale: "en_US",
    default: true,
    enabled: true,
  },
  {
    code: "uk",
    name: "Українська",
    hreflang: "uk",
    ogLocale: "uk_UA",
    enabled: true,
  },
];

export const defaultLocale =
  locales.find((l) => l.default)?.code ?? "en";

export function enabledLocales(): AppLocale[] {
  return locales.filter((l) => l.enabled);
}

export function isLocale(code: string): boolean {
  return enabledLocales().some((l) => l.code === code);
}

export function localePath(code: string, path = ""): string {
  const clean = path.replace(/^\//, "").replace(/\/$/, "");
  const suffix = clean ? `${clean}/` : "";
  if (code === defaultLocale) return `/${suffix}`;
  return `/${code}/${suffix}`;
}

export function alternateLanguages(path = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of enabledLocales()) {
    out[l.hreflang] = localePath(l.code, path);
  }
  return out;
}
