import Script from "next/script";
import { CloudflareBeacon } from "@/components/analytics/CloudflareBeacon";
import "@/app/globals.css";

export function DocumentBody({
  lang,
  className,
  children,
}: {
  lang: "en" | "uk";
  className: string;
  children: React.ReactNode;
}) {
  return (
    <html lang={lang} className={className}>
      <body className="page-body">
        {children}
        <Script src="/landing.js" strategy="lazyOnload" />
        <CloudflareBeacon />
      </body>
    </html>
  );
}
