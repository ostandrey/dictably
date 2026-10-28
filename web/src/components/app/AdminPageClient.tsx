"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  devLogin,
  getAuthConfig,
  getMe,
  type AuthConfig,
  type User,
} from "@/lib/api";
import { AdminPanel, type AdminCopy } from "@/components/app/AdminPanel";

type Props = {
  locale: "en" | "uk";
  appHref: string;
  signInBody: string;
  googleLabel: string;
  googleUnavailable: string;
  devLabel: string;
  loadingLabel: string;
  errorLabel: string;
  notFoundTitle: string;
  notFoundBody: string;
  openApp: string;
  adminCopy: AdminCopy;
};

export function AdminPageClient({
  locale,
  appHref,
  signInBody,
  googleLabel,
  googleUnavailable,
  devLabel,
  loadingLabel,
  errorLabel,
  notFoundTitle,
  notFoundBody,
  openApp,
  adminCopy,
}: Props) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          setConfig(await getAuthConfig());
        } catch {
          setConfig({ google: false, dev_login: false });
        }
        await refresh();
      })();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  async function onDevLogin() {
    setBusy(true);
    setError(null);
    try {
      await devLogin(`admin-${locale}@example.com`, "Admin");
      window.dispatchEvent(new Event("dictably:auth"));
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? errorLabel : errorLabel);
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return (
      <p className="dy-muted" data-admin="boot">
        {loadingLabel}
      </p>
    );
  }

  if (user === null) {
    return (
      <div className="admin-gate" data-admin="sign-in">
        <p className="app-shell__body">{signInBody}</p>
        {error ? (
          <p className="admin-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-gate__actions">
          {config?.google ? (
            <a
              className="dy-btn dy-btn--primary"
              href={`/api/auth/google/start?next=${encodeURIComponent(locale === "uk" ? "/uk/admin/" : "/admin/")}`}
              data-auth="google"
            >
              {googleLabel}
            </a>
          ) : (
            <button type="button" className="dy-btn dy-btn--secondary" disabled>
              {googleUnavailable}
            </button>
          )}
          {config?.dev_login ? (
            <button
              type="button"
              className="dy-btn dy-btn--primary"
              data-auth="dev-login"
              disabled={busy}
              onClick={() => void onDevLogin()}
            >
              {devLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="admin-gate" data-admin="forbidden">
        <h2 className="dy-type-title admin-gate__title">{notFoundTitle}</h2>
        <p className="app-shell__body">{notFoundBody}</p>
        <a className="dy-btn dy-btn--secondary" href={appHref}>
          {openApp}
        </a>
      </div>
    );
  }

  return <AdminPanel copy={adminCopy} />;
}
