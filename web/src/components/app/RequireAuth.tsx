"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/app/AuthProvider";
import { SignInScreen, type SignInCopy } from "@/components/app/SignInScreen";
import { localePath } from "@/i18n/locales";
import { sanitizeNextPath } from "@/lib/safeNext";

type Locale = "en" | "uk";

function BootSkeleton() {
  return (
    <div className="auth-boot" data-shell="skeleton" aria-busy="true">
      <div className="auth-boot__card">
        <div className="app-skel app-skel--title" />
        <div className="app-skel app-skel--block" />
        <div className="app-skel app-skel--block app-skel--short" />
      </div>
    </div>
  );
}

function subscribeLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getLocationSnapshot() {
  return `${window.location.pathname}${window.location.search}`;
}

function getServerLocationSnapshot() {
  return "";
}

function buildCopy(t: ReturnType<typeof useTranslations>, locale: Locale): SignInCopy {
  return {
    brandName: "Dictably",
    title: t("signInTitle"),
    subtitle: t("signInSubtitle"),
    asideTitle: t("signInAsideTitle"),
    googleLabel: t("google"),
    legalBefore: t("signInLegalBefore"),
    termsLabel: t("signInTerms"),
    legalAnd: t("signInLegalAnd"),
    privacyLabel: t("signInPrivacy"),
    legalAfter: t("signInLegalAfter"),
    termsHref: localePath(locale, "terms"),
    privacyHref: localePath(locale, "privacy"),
    point1: t("signInPoint1"),
    point2: t("signInPoint2"),
    point3: t("signInPoint3"),
    devSection: t("signInDevSection"),
    devLabel: t("devLogin"),
    googleUnavailable: t("googleUnavailable"),
    errorLabel: t("error"),
    authErrors: {
      access_denied: t("authErrorAccessDenied"),
      invalid_state: t("authErrorInvalidState"),
      email_unverified: t("authErrorEmailUnverified"),
      oauth_failed: t("authErrorOauthFailed"),
      incomplete_profile: t("authErrorIncompleteProfile"),
    },
  };
}

/** Gate /app/* and /admin: anonymous → full-page sign-in (no app chrome). */
export function RequireAuth({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { status, user } = useAuth();
  const t = useTranslations("app");
  const location = useSyncExternalStore(
    subscribeLocation,
    getLocationSnapshot,
    getServerLocationSnapshot,
  );
  const homeFallback = locale === "uk" ? "/uk/app/" : "/app/";
  const nextPath = sanitizeNextPath(location || homeFallback, homeFallback);

  if (status === "loading") {
    return <BootSkeleton />;
  }
  if (!user) {
    return (
      <SignInScreen
        locale={locale}
        nextPath={nextPath}
        homeFallback={homeFallback}
        copy={buildCopy(t, locale)}
      />
    );
  }
  return children;
}
