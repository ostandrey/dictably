import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingPage } from "@/components/landing/LandingPage";
import { getLandingCopy } from "@/i18n/get-landing";
import { alternateLanguages } from "@/i18n/locales";
import { isPreview, site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getLandingCopy("en");
  return {
    title: copy.meta.title,
    description: copy.meta.description,
    ...(isPreview ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: "/",
      languages: {
        ...alternateLanguages(),
        "x-default": "/",
      },
    },
    openGraph: {
      title: copy.meta.title,
      description: copy.meta.description,
      url: site.url,
      locale: "en_US",
    },
  };
}

export default async function HomePage() {
  setRequestLocale("en");
  const copy = await getLandingCopy("en");
  return <LandingPage copy={copy} />;
}
