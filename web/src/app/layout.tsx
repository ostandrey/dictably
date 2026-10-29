import type { Metadata } from "next";
import { Onest } from "next/font/google";
import { CloudflareBeacon } from "@/components/analytics/CloudflareBeacon";
import { htmlThemeAttrs, siteThemeMode } from "@/lib/theme";
import { isPreview, site } from "@/lib/site";
import "@/app/globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-onest",
  display: "swap",
});

const systemThemeBoot = `(function(){try{var m=document.documentElement.getAttribute("data-theme-mode");if(m!=="system")return;var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;if(dark)document.documentElement.setAttribute("data-theme","dark");else document.documentElement.removeAttribute("data-theme");}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Dictably",
    template: "%s",
  },
  applicationName: site.name,
  ...(isPreview
    ? { robots: { index: false, follow: false } }
    : {}),
  openGraph: {
    type: "website",
    siteName: site.name,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Dictably" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

/** Root shell so `not-found` / 404.html get fonts + tokens (T-036 B2). */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeAttrs = htmlThemeAttrs();
  return (
    <html
      lang="en"
      className={onest.variable}
      data-theme-mode={siteThemeMode}
      {...themeAttrs}
    >
      <body className="page-body">
        {siteThemeMode === "system" ? (
          <script dangerouslySetInnerHTML={{ __html: systemThemeBoot }} />
        ) : null}
        {children}
        <CloudflareBeacon />
      </body>
    </html>
  );
}
