import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RecordingPageClient } from "@/components/app/RecordingPageClient";

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
      minutesEmpty={t("app.minutesEmpty")}
      summaryLabel={t("app.minutesSummary")}
      decisionsLabel={t("app.minutesDecisions")}
      deadlinesLabel={t("app.minutesDeadlines")}
      openQuestionsLabel={t("app.minutesOpenQuestions")}
      agreedToLabel={t("app.minutesAgreedTo")}
      regenerateLabel={t("app.minutesRegenerate")}
      regeneratingLabel={t("app.minutesRegenerating")}
      regenerateLimitLabel={t("app.minutesRegenLimit")}
    />
  );
}
