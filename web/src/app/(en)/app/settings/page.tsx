import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/AppShell";
import { localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "en" });
  return {
    title: `${t("app.settingsTitle")} · Dictably`,
    robots: { index: false, follow: false },
  };
}

export default async function SettingsPage() {
  const t = await getTranslations({ locale: "en" });
  return (
    <AppShell
      heading={t("app.settingsTitle")}
      backHref={localePath("en")}
      backLabel={t("app.back")}
      recordingsHref="/app/"
      settingsHref="/app/settings/"
      peopleHref="/app/people/"
      logoutLabel={t("app.logout")}
      brandName={site.name}
      nav="settings"
      adminHref="/admin/"
      navRecordings={t("app.navRecordings")}
      navPeople={t("app.navPeople")}
      navSettings={t("app.navSettings")}
      navAdmin={t("app.navAdmin")}
      showAccountInMain
    >
      <p className="dy-muted" data-settings="body">
        {t("app.settingsAccount")}
      </p>
    </AppShell>
  );
}
