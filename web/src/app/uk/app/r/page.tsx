import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/AppShell";
import { RecordingPageClient } from "@/components/app/RecordingPageClient";
import { localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "uk" });
  return {
    title: t("app.recordingTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function UkRecordingPage() {
  const t = await getTranslations({ locale: "uk" });
  return (
    <AppShell
      backHref={localePath("uk")}
      backLabel={t("app.back")}
      recordingsHref="/uk/app/"
      logoutLabel={t("app.logout")}
      brandName={site.name}
      nav="recordings"
    >
      <RecordingPageClient
        locale="uk"
        recordingsHref="/uk/app/"
        recordingsLabel={t("app.recordingsH1")}
        renameLabel={t("app.renameSpeakers")}
        findPlaceholder={t("app.findInTranscript")}
        ourLabel={t("app.partyOur")}
        theirLabel={t("app.partyTheir")}
        saveLabel={t("app.save")}
        cancelLabel={t("app.cancel")}
        errorLabel={t("app.error")}
        missingLabel={t("app.recordingMissing")}
        backToNowLabel={t("app.backToNow")}
        matchCountLabel={t("app.matchCount")}
        transcriptTab={t("app.transcriptTab")}
        minutesTab={t("app.minutesTab")}
        minutesStub={t("app.minutesStub")}
      />
    </AppShell>
  );
}
