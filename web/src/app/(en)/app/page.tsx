import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/AppShell";
import { SignInPanel } from "@/components/app/SignInPanel";
import { localePath } from "@/i18n/locales";

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
    <AppShell backHref={localePath("en")} backLabel={t("app.back")}>
      <SignInPanel
        nextPath="/app/"
        signInHeading={t("app.h1")}
        recordingsHeading={t("app.recordingsH1")}
        signedOutBody={t("app.body")}
        googleLabel={t("app.google")}
        googleUnavailable={t("app.googleUnavailable")}
        devLabel={t("app.devLogin")}
        signedInAs={t("app.signedInAs")}
        logoutLabel={t("app.logout")}
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
          listTitle: t("app.recordingsTitle"),
          tooLarge: t("app.uploadTooLarge"),
          error: t("app.error"),
          statusUploaded: t("app.statusUploaded"),
          statusProcessing: t("app.statusProcessing"),
          statusReady: t("app.statusReady"),
          statusFailed: t("app.statusFailed"),
        }}
      />
    </AppShell>
  );
}
