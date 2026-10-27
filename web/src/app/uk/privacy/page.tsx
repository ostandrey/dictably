import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { PrivacyPage } from "@/components/landing/PrivacyPage";
import { getPrivacyCopy } from "@/i18n/get-landing";
import { alternateLanguages, localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getPrivacyCopy("uk");
  return {
    title: copy.title,
    description: copy.metaDescription,
    alternates: {
      canonical: "/uk/privacy/",
      languages: alternateLanguages("privacy"),
    },
    openGraph: {
      title: copy.title,
      description: copy.metaDescription,
      url: `${site.url}/uk/privacy/`,
      locale: "uk_UA",
    },
  };
}

export default async function PrivacyUkPage() {
  setRequestLocale("uk");
  const copy = await getPrivacyCopy("uk");
  return <PrivacyPage copy={copy} homeHref={localePath("uk")} />;
}
