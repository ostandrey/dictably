import type { Metadata } from "next";
import { Onest } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { DocumentBody } from "@/components/layout/DocumentBody";
import { site } from "@/lib/site";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Dictably",
    template: "%s",
  },
  applicationName: site.name,
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

export default async function UkRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  setRequestLocale("uk");
  const messages = await getMessages();
  return (
    <DocumentBody lang="uk" className={onest.variable}>
      <NextIntlClientProvider messages={messages}>
        {children}
      </NextIntlClientProvider>
    </DocumentBody>
  );
}
