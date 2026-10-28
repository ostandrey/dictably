import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/AppShell";
import { SignInPanel } from "@/components/app/SignInPanel";
import { localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "uk" });
  return {
    title: t("app.title"),
    robots: { index: false, follow: false },
  };
}

export default async function UkAppSignInPage() {
  const t = await getTranslations({ locale: "uk" });
  return (
    <AppShell
      backHref={localePath("uk")}
      backLabel={t("app.back")}
      recordingsHref="/uk/app/"
      settingsHref="/uk/app/settings/"
      peopleHref="/uk/app/people/"
      logoutLabel={t("app.logout")}
      brandName={site.name}
      nav="recordings"
      navRecordings={t("app.navRecordings")}
      navPeople={t("app.navPeople")}
      navSettings={t("app.navSettings")}
    >
      <SignInPanel
        nextPath="/uk/app/"
        recordingBaseHref="/uk/app/r/"
        signInHeading={t("app.h1")}
        signedOutBody={t("app.body")}
        googleLabel={t("app.google")}
        googleUnavailable={t("app.googleUnavailable")}
        devLabel={t("app.devLogin")}
        loadingLabel={t("app.loading")}
        errorLabel={t("app.error")}
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
    </AppShell>
  );
}
