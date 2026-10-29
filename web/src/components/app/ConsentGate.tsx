"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/app/AuthProvider";
import { Dialog } from "@/components/ui/Dialog";
import { localePath } from "@/i18n/locales";
import { postConsent } from "@/lib/api";
import { captureAttributionFromLocation, peekAttribution } from "@/lib/attribution";

/** First-login Terms/Privacy accept + marketing opt-in (T-033). Non-dismissible. */
export function ConsentGate() {
  const t = useTranslations("app");
  const locale = useLocale() as "en" | "uk";
  const { status, user, setUser } = useAuth();
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open =
    status === "authenticated" && Boolean(user?.needs_consent);

  if (!open) return null;

  const privacyHref = localePath(locale, "privacy");
  const termsHref = localePath(locale, "terms");

  async function accept() {
    setBusy(true);
    setError(null);
    captureAttributionFromLocation();
    const attr = peekAttribution();
    try {
      const next = await postConsent({
        marketing_opt_in: marketing,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale,
        signup_utm: Object.keys(attr.signup_utm).length ? attr.signup_utm : null,
        signup_referrer: attr.signup_referrer,
      });
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
      title={t("consentTitle")}
      onClose={() => {}}
      actions={
        <button
          type="button"
          className="dy-btn dy-btn--primary"
          disabled={busy}
          data-consent="accept"
          onClick={() => void accept()}
        >
          {busy ? t("loading") : t("consentAccept")}
        </button>
      }
    >
      <p>
        {t.rich("consentBody", {
          terms: (chunks) => (
            <a href={termsHref} target="_blank" rel="noreferrer">
              {chunks}
            </a>
          ),
          privacy: (chunks) => (
            <a href={privacyHref} target="_blank" rel="noreferrer">
              {chunks}
            </a>
          ),
        })}
      </p>
      <label className="dy-check" data-consent="marketing">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
        />
        <span>{t("consentMarketing")}</span>
      </label>
      {error ? <p className="dy-form-error">{error}</p> : null}
    </Dialog>
  );
}
