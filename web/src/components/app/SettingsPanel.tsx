"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { clearAuthSession, useAuth } from "@/components/app/AuthProvider";
import { Dialog } from "@/components/ui/Dialog";
import { deleteAccount, exportAccount, learnVocabulary, patchMe } from "@/lib/api";
import { localePath } from "@/i18n/locales";
import { formatBalanceSeconds } from "@/lib/mediaDuration";

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
  const [vocabBusy, setVocabBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // T-047 F4: prefer saved locale, else current page locale (not always EN).
  const [uiLocale, setUiLocale] = useState<"en" | "uk">(
    user?.locale === "uk" || user?.locale === "en"
      ? user.locale
      : locale,
  );
  const [template, setTemplate] = useState(
    user?.preferred_minutes_template === "official_protocol"
      ? "official_protocol"
      : "default",
  );
  const [notifyReady, setNotifyReady] = useState(
    user?.notify_ready_email !== false,
  );
  const vocabulary = user?.vocabulary ?? [];
  const [vocabDraft, setVocabDraft] = useState("");

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
        notify_ready_email: notifyReady,
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

  async function onAddTerm() {
    const term = vocabDraft.trim();
    if (!term) return;
    setVocabBusy(true);
    setError(null);
    try {
      const next = await learnVocabulary(term);
      setUser(next);
      setVocabDraft("");
    } catch {
      setError(t("error"));
    } finally {
      setVocabBusy(false);
    }
  }

  async function onRemoveTerm(term: string) {
    setVocabBusy(true);
    setError(null);
    try {
      const nextList = vocabulary.filter((v) => v !== term);
      const next = await patchMe({ vocabulary: nextList });
      setUser(next);
    } catch {
      setError(t("error"));
    } finally {
      setVocabBusy(false);
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
            <span className="dy-time">
              {formatBalanceSeconds(balance, { locale })}
            </span>
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
          <label className="dy-settings__check" data-settings="notify-ready">
            <input
              type="checkbox"
              checked={notifyReady}
              onChange={(e) => setNotifyReady(e.target.checked)}
            />
            <span>{t("notifyReadyEmail")}</span>
          </label>
          <button
            type="button"
            className="dy-btn dy-btn--secondary dy-settings__save"
            disabled={saveBusy}
            data-settings="save-defaults"
            onClick={() => void onSaveDefaults()}
          >
            {saveBusy ? t("loading") : t("settingsSaveDefaults")}
          </button>
        </div>
      </section>

      {/* T-046 N1: own section (saves immediately — not under Save defaults) */}
      <section className="dy-settings__section" aria-labelledby="settings-vocabulary">
        <h2 id="settings-vocabulary" className="dy-settings__h">
          {t("settingsVocabularyLabel")}
        </h2>
        <p className="dy-settings__p">{t("settingsVocabularyHint")}</p>
        <div className="dy-settings__vocab" data-settings="vocabulary">
          {vocabulary.length === 0 ? (
            <p className="dy-settings__vocab-empty" data-settings="vocabulary-empty">
              {t("settingsVocabularyEmpty")}
            </p>
          ) : (
            <ul className="dy-settings__vocab-list" data-settings="vocabulary-list">
              {vocabulary.map((term) => (
                <li key={term} className="dy-settings__vocab-item">
                  <span>{term}</span>
                  <button
                    type="button"
                    className="btn-text dy-settings__vocab-remove"
                    disabled={vocabBusy}
                    data-settings="vocabulary-remove"
                    data-term={term}
                    onClick={() => void onRemoveTerm(term)}
                  >
                    {t("settingsVocabularyRemove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {vocabulary.length < 200 ? (
            <div className="dy-settings__vocab-add">
              <label className="dy-settings__field dy-settings__vocab-add-field">
                <span>{t("settingsVocabularyAddLabel")}</span>
                <input
                  className="dy-input"
                  value={vocabDraft}
                  data-settings="vocabulary-input"
                  maxLength={64}
                  placeholder={t("settingsVocabularyPlaceholder")}
                  onChange={(e) => setVocabDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onAddTerm();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="dy-btn dy-btn--secondary"
                disabled={vocabBusy || !vocabDraft.trim()}
                data-settings="vocabulary-add"
                onClick={() => void onAddTerm()}
              >
                {t("settingsVocabularyAdd")}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="dy-settings__section" aria-labelledby="settings-data">
        <h2 id="settings-data" className="dy-settings__h">
          {t("settingsDataTitle")}
        </h2>
        <p className="dy-settings__p">{t("settingsDataBody")}</p>
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
