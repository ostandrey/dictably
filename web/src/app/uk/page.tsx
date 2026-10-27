import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingPage } from "@/components/landing/LandingPage";
import { getLandingCopy } from "@/i18n/get-landing";
import { alternateLanguages } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getLandingCopy("uk");
  return {
    title: copy.meta.title,
    description: copy.meta.description,
    alternates: {
      canonical: "/uk/",
      languages: {
        ...alternateLanguages(),
        "x-default": "/",
      },
    },
    openGraph: {
      title: copy.meta.title,
      description: copy.meta.description,
      url: `${site.url}/uk/`,
      locale: "uk_UA",
    },
  };
}

export default async function UkHomePage() {
  setRequestLocale("uk");
  const copy = await getLandingCopy("uk");
  return <LandingPage copy={copy} />;
}
