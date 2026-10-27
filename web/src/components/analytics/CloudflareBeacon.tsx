import Script from "next/script";
import { site } from "@/lib/site";

/** Cloudflare Web Analytics — no cookies, no banner. Renders only if token set. */
export function CloudflareBeacon() {
  if (!site.cloudflareBeacon) return null;
  return (
    <Script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: site.cloudflareBeacon })}
      strategy="afterInteractive"
    />
  );
}
