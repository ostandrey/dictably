import Script from "next/script";
import { CloudflareBeacon } from "@/components/analytics/CloudflareBeacon";
import { htmlThemeAttrs, siteThemeMode } from "@/lib/theme";
import "@/app/globals.css";

const systemThemeBoot = `(function(){try{var m=document.documentElement.getAttribute("data-theme-mode");if(m!=="system")return;var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;if(dark)document.documentElement.setAttribute("data-theme","dark");else document.documentElement.removeAttribute("data-theme");}catch(e){}})();`;

export function DocumentBody({
  lang,
  className,
  children,
}: {
  lang: "en" | "uk";
  className: string;
  children: React.ReactNode;
}) {
  const themeAttrs = htmlThemeAttrs();
  return (
    <html
      lang={lang}
      className={className}
      data-theme-mode={siteThemeMode}
      {...themeAttrs}
    >
      <body className="page-body">
        {siteThemeMode === "system" ? (
          <script
            dangerouslySetInnerHTML={{ __html: systemThemeBoot }}
          />
        ) : null}
        {children}
        <Script src="/landing.js" strategy="lazyOnload" />
        <CloudflareBeacon />
      </body>
    </html>
  );
}
