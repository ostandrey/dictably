import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /app stays crawlable enough to see noindex (T-003 nit); block admin, lab, API.
      disallow: ["/admin/", "/uk/admin/", "/lab/", "/api/"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
