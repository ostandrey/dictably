"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/app/AuthProvider";
import { Dialog } from "@/components/ui/Dialog";
import { postOnboarding } from "@/lib/api";

const USE_CASES = [
  "client_meetings",
  "internal",
  "interviews",
  "training",
  "other",
] as const;

const MEETING_LOCALES = ["en", "uk", "pl", "de", "es", "other"] as const;

/** One-screen post-consent onboarding; Skip never shows again (T-033). */
export function OnboardingGate() {
  const t = useTranslations("app");
  const { status, user, setUser } = useAuth();
  const [cases, setCases] = useState<string[]>([]);
  const [meetingLocale, setMeetingLocale] = useState<string>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open =
    status === "authenticated" &&
    Boolean(user && !user.needs_consent && user.needs_onboarding);

  if (!open) return null;

  function toggleCase(id: string) {
    setCases((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function submit(skipped: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await postOnboarding(
        skipped
          ? { skipped: true }
          : {
              skipped: false,
              use_cases: cases,
              meeting_locale: meetingLocale,
            },
      );
      setUser(next);
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      dismissible={false}
      title={t("onboardingTitle")}
      onClose={() => {}}
      actions={
        <>
          <button
            type="button"
            className="dy-btn dy-btn--ghost"
            disabled={busy}
            data-onboarding="skip"
            onClick={() => void submit(true)}
          >
            {t("onboardingSkip")}
          </button>
          <button
            type="button"
            className="dy-btn dy-btn--primary"
            disabled={busy}
            data-onboarding="continue"
            onClick={() => void submit(false)}
          >
            {busy ? t("loading") : t("onboardingContinue")}
          </button>
        </>
      }
    >
      <p className="dy-onboard__lead">{t("onboardingUseCase")}</p>
      <div className="dy-chip-row" role="group" aria-label={t("onboardingUseCase")}>
        {USE_CASES.map((id) => {
          const selected = cases.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`dy-chip${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              data-onboarding-case={id}
              onClick={() => toggleCase(id)}
            >
              {t(`onboardingCase_${id}`)}
            </button>
          );
        })}
      </div>
      <label className="dy-field">
        <span className="dy-field__label">{t("onboardingMeetingLang")}</span>
        <select
          className="dy-select"
          value={meetingLocale}
          data-onboarding="meeting-locale"
          onChange={(e) => setMeetingLocale(e.target.value)}
        >
          {MEETING_LOCALES.map((code) => (
            <option key={code} value={code}>
              {t(`onboardingLang_${code}`)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="dy-form-error">{error}</p> : null}
    </Dialog>
  );
}
