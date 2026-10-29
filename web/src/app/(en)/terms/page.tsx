import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalDocPage } from "@/components/landing/LegalDocPage";
import { getTermsCopy } from "@/i18n/get-landing";
import { alternateLanguages, localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getTermsCopy("en");
  return {
    title: copy.title,
    description: copy.metaDescription,
    alternates: {
      canonical: "/terms/",
      languages: alternateLanguages("terms"),
    },
    openGraph: {
      title: copy.title,
      description: copy.metaDescription,
      url: `${site.url}/terms/`,
      locale: "en_US",
    },
  };
}

export default async function TermsEnPage() {
  setRequestLocale("en");
  const copy = await getTermsCopy("en");
  return <LegalDocPage copy={copy} homeHref={localePath("en")} />;
}
