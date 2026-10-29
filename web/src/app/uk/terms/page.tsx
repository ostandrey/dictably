import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalDocPage } from "@/components/landing/LegalDocPage";
import { getTermsCopy } from "@/i18n/get-landing";
import { alternateLanguages, localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getTermsCopy("uk");
  return {
    title: copy.title,
    description: copy.metaDescription,
    alternates: {
      canonical: "/uk/terms/",
      languages: alternateLanguages("terms"),
    },
    openGraph: {
      title: copy.title,
      description: copy.metaDescription,
      url: `${site.url}/uk/terms/`,
      locale: "uk_UA",
    },
  };
}

export default async function TermsUkPage() {
  setRequestLocale("uk");
  const copy = await getTermsCopy("uk");
  return <LegalDocPage copy={copy} homeHref={localePath("uk")} />;
}
