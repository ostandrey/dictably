import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInPanel } from "@/components/app/SignInPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "en" });
  return {
    title: t("app.title"),
    robots: { index: false, follow: false },
  };
}

export default async function AppSignInPage() {
  const t = await getTranslations({ locale: "en" });
  return (
    <SignInPanel
      nextPath="/app/"
      recordingBaseHref="/app/r/"
      signInHeading={t("app.h1")}
      signedOutBody={t("app.body")}
      googleLabel={t("app.google")}
      googleUnavailable={t("app.googleUnavailable")}
      devLabel={t("app.devLogin")}
      loadingLabel={t("app.loading")}
      errorLabel={t("app.error")}
      deletedToast={t("app.deletedToast")}
      authErrors={{
        access_denied: t("app.authErrorAccessDenied"),
        invalid_state: t("app.authErrorInvalidState"),
        email_unverified: t("app.authErrorEmailUnverified"),
        oauth_failed: t("app.authErrorOauthFailed"),
        incomplete_profile: t("app.authErrorIncompleteProfile"),
      }}
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
      }}
    />
  );
}
