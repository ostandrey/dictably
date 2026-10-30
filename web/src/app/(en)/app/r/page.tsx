import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RecordingPageClient } from "@/components/app/RecordingPageClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "en" });
  return {
    title: t("app.recordingTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function RecordingPage() {
  const t = await getTranslations({ locale: "en" });
  return (
    <RecordingPageClient
      locale="en"
      recordingsHref="/app/"
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
      exportLabel={t("app.export")}
      exportMenuLabel={t("app.exportMenu")}
      exportMinutesDocx={t("app.exportMinutesDocx")}
      exportMinutesPdf={t("app.exportMinutesPdf")}
      exportMinutesCopy={t("app.exportMinutesCopy")}
      exportMinutesCopied={t("app.exportMinutesCopied")}
      exportFollowUp={t("app.exportFollowUp")}
      exportFollowUpTitle={t("app.exportFollowUpTitle")}
      exportFollowUpSubject={t("app.exportFollowUpSubject")}
      exportFollowUpBody={t("app.exportFollowUpBody")}
      exportFollowUpCopy={t("app.exportFollowUpCopy")}
      exportFollowUpCopied={t("app.exportFollowUpCopied")}
      exportFollowUpMail={t("app.exportFollowUpMail")}
      exportFollowUpMailtoHint={t("app.exportFollowUpMailtoHint")}
      exportFollowUpWeak={t("app.exportFollowUpWeak")}
      exportTranscriptTxt={t("app.exportTranscriptTxt")}
      exportTranscriptDocx={t("app.exportTranscriptDocx")}
      exportTranscriptSrt={t("app.exportTranscriptSrt")}
      exportTranscriptVtt={t("app.exportTranscriptVtt")}
      exportFailed={t("app.exportFailed")}
      partySideLabel={t("app.partySideLabel")}
      mergeWithLabel={t("app.mergeWithLabel")}
      changeSpeakerLabel={t("app.changeSpeakerLabel")}
      newSpeakerLabel={t("app.newSpeakerLabel")}
      cleanModeLabel={t("app.cleanModeLabel")}
      verbatimModeLabel={t("app.verbatimModeLabel")}
      meetingDateHint={t("app.meetingDateHint")}
      dueDatesRecalcToast={t("app.dueDatesRecalcToast")}
    />
  );
}
