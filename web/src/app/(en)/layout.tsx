import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { DocumentBody } from "@/components/layout/DocumentBody";
import { isPreview, site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  ...(isPreview ? { robots: { index: false, follow: false } } : {}),
  // favicon.ico via src/app/favicon.ico (Next injects once — T-048 S2)
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
};

export default async function EnRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  setRequestLocale("en");
  const messages = await getMessages();
  const t = await getTranslations({ locale: "en", namespace: "site" });
  return (
    <DocumentBody lang="en" previewLabel={t("previewBanner")}>
      <NextIntlClientProvider messages={messages}>
        {children}
      </NextIntlClientProvider>
    </DocumentBody>
  );
}
