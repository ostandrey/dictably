import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/AppShell";
import { localePath } from "@/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "en" });
  return {
    title: t("app.adminTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage() {
  const t = await getTranslations({ locale: "en" });
  return (
    <AppShell
      heading={t("app.adminH1")}
      backHref={localePath("en")}
      backLabel={t("app.back")}
    >
      <p className="app-shell__body">{t("app.adminBody")}</p>
    </AppShell>
  );
}
