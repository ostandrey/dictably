import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/AppShell";
import { localePath } from "@/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "uk" });
  return {
    title: t("app.title"),
    robots: { index: false, follow: false },
  };
}

export default async function UkAppSignInPage() {
  const t = await getTranslations({ locale: "uk" });
  return (
    <AppShell
      heading={t("app.h1")}
      body={t("app.body")}
      backHref={localePath("uk")}
      backLabel={t("app.back")}
    />
  );
}
