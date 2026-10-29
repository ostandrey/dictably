import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPanel } from "@/components/app/PlaceholderPanel";
import { IllPeople } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "en" });
  return {
    title: `${t("app.navPeople")} · Dictably`,
    robots: { index: false, follow: false },
  };
}

export default async function PeoplePage() {
  const t = await getTranslations({ locale: "en" });
  return (
    <PlaceholderPanel
      illustration={<IllPeople />}
      title={t("app.peopleTitle")}
      body={t("app.peopleBody")}
      actionHref="/app/"
      actionLabel={t("app.uploadCta")}
      data-testid="people"
    />
  );
}
