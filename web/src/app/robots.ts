import type { MetadataRoute } from "next";
import { isPreview, site } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  if (isPreview) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /app stays crawlable enough to see noindex (T-003 nit); block admin + API.
      disallow: ["/admin/", "/uk/admin/", "/api/"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
