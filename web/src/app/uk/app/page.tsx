import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInPanel } from "@/components/app/SignInPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "uk" });
  return {
    title: t("app.title"),
    robots: { index: false, follow: false },
  };
}

export default async function UkAppHomePage() {
  const t = await getTranslations({ locale: "uk" });
  return (
    <SignInPanel
      recordingBaseHref="/uk/app/r/"
      deletedToast={t("app.deletedToast")}
      recordings={{
        title: t("app.uploadTitle"),
        hint: t("app.uploadHint"),
        choose: t("app.uploadChoose"),
        drop: t("app.uploadDrop"),
        uploading: t("app.uploadProgress"),
        cancel: t("app.uploadCancel"),
        empty: t("app.recordingsEmpty"),
        searchPlaceholder: t("app.searchRecordings"),
        uploadCta: t("app.uploadCta"),
        tooLarge: t("app.uploadTooLarge"),
        badType: t("app.uploadBadType"),
        error: t("app.error"),
        statusUploaded: t("app.statusUploaded"),
        statusQueued: t("app.statusQueued"),
        statusQueuedHint: t("app.statusQueuedHint"),
        statusProcessing: t("app.statusProcessing"),
        statusReady: t("app.statusReady"),
        statusFailed: t("app.statusFailed"),
        menuLabel: t("app.recordingMenu"),
        deleteLabel: t("app.deleteRecording"),
        deleteConfirmTitle: t("app.deleteRecordingTitle"),
        deleteConfirmBody: t("app.deleteRecordingBody"),
        deleteConfirmAction: t("app.deleteRecordingConfirm"),
        keepLabel: t("app.keepRecording"),
        deleteBusyHint: t("app.deleteBusyHint"),
        emptyBody: t("app.recordingsEmptyBody"),
        uploadDetailsTitle: t("app.uploadDetailsTitle"),
        uploadDetailsContinue: t("app.uploadDetailsContinue"),
        uploadLanguageLabel: t("app.uploadLanguageLabel"),
        uploadLanguageAuto: t("app.uploadLanguageAuto"),
        uploadSpeakersLabel: t("app.uploadSpeakersLabel"),
        uploadSpeakersAuto: t("app.uploadSpeakersAuto"),
        uploadVocabLabel: t("app.uploadVocabLabel"),
        uploadVocabHint: t("app.uploadVocabHint"),
        uploadTrackLabel: t("app.uploadTrackLabel"),
        uploadMeetingBundle: t("app.uploadMeetingBundle"),
        uploadMeetingBundleHint: t("app.uploadMeetingBundleHint"),
        uploadBundleTooLarge: t("app.uploadBundleTooLarge"),
        uploadTemplateLabel: t("app.uploadTemplateLabel"),
        minutesTemplateDefault: t("app.minutesTemplateDefault"),
        minutesTemplateOfficial: t("app.minutesTemplateOfficial"),
      }}
    />
  );
}
