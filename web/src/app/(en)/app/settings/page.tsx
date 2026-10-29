import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPanel } from "@/components/app/PlaceholderPanel";
import { IllSettings } from "@/components/illustrations";

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
    <PlaceholderPanel
      illustration={<IllSettings />}
      title={t("app.settingsSectionsTitle")}
      body={t("app.settingsSectionsBody")}
      data-testid="settings"
    />
  );
}
