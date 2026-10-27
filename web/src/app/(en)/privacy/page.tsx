import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { PrivacyPage } from "@/components/landing/PrivacyPage";
import { getPrivacyCopy } from "@/i18n/get-landing";
import { alternateLanguages, localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getPrivacyCopy("en");
  return {
    title: copy.title,
    description: copy.metaDescription,
    alternates: {
      canonical: "/privacy/",
      languages: alternateLanguages("privacy"),
    },
    openGraph: {
      title: copy.title,
      description: copy.metaDescription,
      url: `${site.url}/privacy/`,
      locale: "en_US",
    },
  };
}

export default async function PrivacyEnPage() {
  setRequestLocale("en");
  const copy = await getPrivacyCopy("en");
  return <PrivacyPage copy={copy} homeHref={localePath("en")} />;
}
