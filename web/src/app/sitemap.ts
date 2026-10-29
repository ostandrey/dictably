import type { MetadataRoute } from "next";
import { enabledLocales, localePath } from "@/i18n/locales";
import { isPreview, site } from "@/lib/site";

export const dynamic = "force-static";

const pages = ["", "privacy", "terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  if (isPreview) return [];

  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of pages) {
    const languages: Record<string, string> = {};
    for (const l of enabledLocales()) {
      languages[l.hreflang] = `${site.url}${localePath(l.code, page)}`;
    }
    for (const l of enabledLocales()) {
      entries.push({
        url: `${site.url}${localePath(l.code, page)}`,
        lastModified: now,
        changeFrequency: page ? "monthly" : "weekly",
        priority: page ? 0.3 : l.default ? 1 : 0.9,
        alternates: { languages },
      });
    }
  }

  return entries;
}
