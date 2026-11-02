"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { clearAuthSession, useAuth } from "@/components/app/AuthProvider";
import { Dialog } from "@/components/ui/Dialog";
import { deleteAccount, exportAccount, patchMe } from "@/lib/api";
import { localePath } from "@/i18n/locales";

function formatBalance(seconds: number): string {
  if (seconds <= 0) return "0 m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m} m`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** Account settings: Billing → Defaults → Data → Delete (T-041 P0 / S6). */
export function SettingsPanel() {
  const t = useTranslations("app");
  const locale = useLocale() as "en" | "uk";
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiLocale, setUiLocale] = useState<"en" | "uk">(
    user?.locale === "uk" ? "uk" : "en",
  );
  const [template, setTemplate] = useState(
    user?.preferred_minutes_template === "official_protocol"
      ? "official_protocol"
      : "default",
  );

  const balance = user?.balance_seconds ?? 0;

  async function onExport() {
    setExportBusy(true);
    setError(null);
    try {
      const data = await exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dictably-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("error"));
    } finally {
      setExportBusy(false);
    }
  }

  async function onSaveDefaults() {
    setSaveBusy(true);
    setError(null);
    try {
      const next = await patchMe({
        locale: uiLocale,
        preferred_minutes_template: template,
      });
      setUser(next);
      if (uiLocale !== locale) {
        router.push(localePath(uiLocale, "app/settings"));
      }
    } catch {
      setError(t("error"));
    } finally {
      setSaveBusy(false);
    }
  }

  async function onDelete() {
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteAccount();
      clearAuthSession();
      setUser(null);
      setDeleteOpen(false);
      router.push(localePath(locale, "app"));
    } catch {
      setError(t("error"));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="dy-settings" data-settings="panel">
      <h1 className="dy-settings__page-title">{t("settingsTitle")}</h1>

      <section className="dy-settings__section dy-settings__section--first" aria-labelledby="settings-billing">
        <h2 id="settings-billing" className="dy-settings__h">
          {t("settingsBillingTitle")}
        </h2>
        <p className="dy-settings__p">{t("settingsBillingBody")}</p>
        <div className="dy-settings__quota" data-settings="quota" data-minutes>
          <div className="dy-settings__quota-row">
            <span>{t("settingsQuota")}</span>
            <span className="dy-time">{formatBalance(balance)}</span>
          </div>
        </div>
      </section>

      <section className="dy-settings__section" aria-labelledby="settings-defaults">
        <h2 id="settings-defaults" className="dy-settings__h">
          {t("settingsDefaultsTitle")}
        </h2>
        <p className="dy-settings__p">{t("settingsDefaultsBody")}</p>
        <div className="dy-settings__fields" data-settings="defaults">
          <label className="dy-settings__field">
            <span>{t("settingsLocaleLabel")}</span>
            <select
              value={uiLocale}
              data-settings="locale"
              onChange={(e) => setUiLocale(e.target.value === "uk" ? "uk" : "en")}
            >
              <option value="en">{t("onboardingLang_en")}</option>
              <option value="uk">{t("onboardingLang_uk")}</option>
            </select>
          </label>
          <label className="dy-settings__field">
            <span>{t("settingsTemplateLabel")}</span>
            <select
              value={template}
              data-settings="template"
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="default">{t("minutesTemplateDefault")}</option>
              <option value="official_protocol">{t("minutesTemplateOfficial")}</option>
            </select>
          </label>
          <button
            type="button"
            className="dy-btn dy-btn--secondary"
            disabled={saveBusy}
            data-settings="save-defaults"
            onClick={() => void onSaveDefaults()}
          >
            {saveBusy ? t("loading") : t("settingsSaveDefaults")}
          </button>
        </div>
      </section>

      <section className="dy-settings__section" aria-labelledby="settings-data">
        <h2 id="settings-data" className="dy-settings__h">
          {t("settingsDataTitle")}
        </h2>
        <p className="dy-settings__p">{t("settingsDataBody")}</p>
        {user ? (
          <p className="dy-settings__meta" data-settings="email">
            {user.email}
          </p>
        ) : null}
        <div className="dy-settings__actions">
          <button
            type="button"
            className="dy-btn dy-btn--secondary"
            disabled={exportBusy}
            data-settings="export"
            onClick={() => void onExport()}
          >
            {exportBusy ? t("loading") : t("settingsExport")}
          </button>
        </div>
      </section>

      <section className="dy-settings__section dy-settings__section--danger" aria-labelledby="settings-delete">
        <h2 id="settings-delete" className="visually-hidden">
          {t("settingsDelete")}
        </h2>
        <button
          type="button"
          className="dy-settings__delete-link"
          data-settings="delete"
          onClick={() => setDeleteOpen(true)}
        >
          {t("settingsDelete")}
        </button>
      </section>

      {error ? <p className="dy-form-error">{error}</p> : null}

      <Dialog
        open={deleteOpen}
        title={t("settingsDeleteTitle")}
        onClose={() => setDeleteOpen(false)}
        actions={
          <>
            <button
              type="button"
              className="dy-btn dy-btn--ghost"
              disabled={deleteBusy}
              onClick={() => setDeleteOpen(false)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className="dy-btn dy-btn--danger"
              disabled={deleteBusy}
              data-settings="delete-confirm"
              onClick={() => void onDelete()}
            >
              {deleteBusy ? t("loading") : t("settingsDeleteConfirm")}
            </button>
          </>
        }
      >
        <p>{t("settingsDeleteBody")}</p>
      </Dialog>
    </div>
  );
}
