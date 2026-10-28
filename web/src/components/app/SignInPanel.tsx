"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ApiError,
  devLogin,
  getAuthConfig,
  getMe,
  logout,
  type AuthConfig,
  type User,
} from "@/lib/api";

const AUTH_ERROR_CODES = [
  "access_denied",
  "invalid_state",
  "email_unverified",
  "oauth_failed",
  "incomplete_profile",
] as const;

type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

type Props = {
  nextPath: "/app/" | "/uk/app/";
  signedOutBody: string;
  googleLabel: string;
  googleUnavailable: string;
  devLabel: string;
  signedInAs: string;
  logoutLabel: string;
  loadingLabel: string;
  errorLabel: string;
  authErrors: Record<AuthErrorCode, string>;
};

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

function subscribeSearch(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getSearchSnapshot() {
  return window.location.search;
}

function getServerSearchSnapshot() {
  return "";
}

export function SignInPanel({
  nextPath,
  signedOutBody,
  googleLabel,
  googleUnavailable,
  devLabel,
  signedInAs,
  logoutLabel,
  loadingLabel,
  errorLabel,
  authErrors,
}: Props) {
  const search = useSyncExternalStore(
    subscribeSearch,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );

  const oauthError = useMemo(() => {
    const code = new URLSearchParams(search).get("auth_error");
    if (!code || !isAuthErrorCode(code)) return null;
    return authErrors[code];
  }, [authErrors, search]);

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const error = actionError ?? oauthError;

  // Strip auth_error from the URL without setState (B3).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("auth_error")) return;
    params.delete("auth_error");
    const qs = params.toString();
    const clean = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", clean);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cfg, me] = await Promise.all([
          getAuthConfig(),
          getMe().catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 401) return null;
            throw err;
          }),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setUser(me);
      } catch {
        if (!cancelled) setActionError(errorLabel);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [errorLabel]);

  async function onDevLogin() {
    setBusy(true);
    setActionError(null);
    try {
      const me = await devLogin();
      setUser(me);
    } catch {
      setActionError(errorLabel);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    setActionError(null);
    try {
      await logout();
      setUser(null);
    } catch {
      setActionError(errorLabel);
    } finally {
      setBusy(false);
    }
  }

  if (busy && !user && !config) {
    return <p className="app-shell__body">{loadingLabel}</p>;
  }

  if (user) {
    return (
      <div className="sign-in">
        <p className="app-shell__body">
          {signedInAs.replace("{email}", user.email)}
        </p>
        {error ? (
          <p className="sign-in__error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="sign-in__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void onLogout()}
            disabled={busy}
            data-auth="logout"
          >
            {logoutLabel}
          </button>
        </p>
      </div>
    );
  }

  const googleHref = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="sign-in">
      <p className="app-shell__body">{signedOutBody}</p>
      {error ? (
        <p className="sign-in__error" role="alert" data-auth="error">
          {error}
        </p>
      ) : null}
      <div className="sign-in__actions">
        {config?.google ? (
          <a className="btn-primary" href={googleHref} data-auth="google">
            {googleLabel}
          </a>
        ) : (
          <p className="sign-in__hint">{googleUnavailable}</p>
        )}
        {config?.dev_login ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void onDevLogin()}
            disabled={busy}
            data-auth="dev-login"
          >
            {devLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
