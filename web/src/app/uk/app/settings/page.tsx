import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsPanel } from "@/components/app/SettingsPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "uk" });
  return {
    title: `${t("app.settingsTitle")} · Dictably`,
    robots: { index: false, follow: false },
  };
}

export default function SettingsUkPage() {
  return <SettingsPanel />;
}
