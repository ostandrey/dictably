"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { clearAuthSession, useAuth } from "@/components/app/AuthProvider";
import { Dialog } from "@/components/ui/Dialog";
import { IllSettings } from "@/components/illustrations";
import { deleteAccount, exportAccount } from "@/lib/api";
import { localePath } from "@/i18n/locales";

/** Account export + delete (T-033). Replaces settings placeholder. */
export function SettingsPanel() {
  const t = useTranslations("app");
  const locale = useLocale() as "en" | "uk";
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="dy-empty dy-empty--rich">
        <div className="dy-empty__ill" aria-hidden>
          <IllSettings />
        </div>
        <h1 className="dy-empty__title">{t("settingsAccountTitle")}</h1>
        <p className="dy-empty__body">{t("settingsAccountBody")}</p>
      </div>

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
          <button
            type="button"
            className="dy-btn dy-btn--danger"
            data-settings="delete"
            onClick={() => setDeleteOpen(true)}
          >
            {t("settingsDelete")}
          </button>
        </div>
        {error ? <p className="dy-form-error">{error}</p> : null}
      </section>

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
