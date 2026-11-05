import type { Metadata, Viewport } from "next";
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

/** S7: 404 locale before paint — path /uk/* or navigator.language uk* → uk, else en. */
const nfLocaleBoot = `(function(){try{var p=location.pathname||"";var uk=p.indexOf("/uk/")===0||p==="/uk"||((navigator.language||"").toLowerCase().indexOf("uk")===0);document.documentElement.setAttribute("data-nf-lang",uk?"uk":"en");}catch(e){try{document.documentElement.setAttribute("data-nf-lang","en");}catch(_){}}})();`;

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
  // favicon.ico via src/app/favicon.ico (Next injects once — T-048 S2)
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
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

export const viewport: Viewport = {
  themeColor: "#0f7b6c",
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
      suppressHydrationWarning
      {...themeAttrs}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: nfLocaleBoot }} />
      </head>
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
