"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ApiError,
  devLogin,
  getAuthConfig,
  getMe,
  type AuthConfig,
  type User,
} from "@/lib/api";
import {
  RecordingsPanel,
  type RecordingsCopy,
} from "@/components/app/RecordingsPanel";

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
  recordingBaseHref: string;
  signInHeading: string;
  signedOutBody: string;
  googleLabel: string;
  googleUnavailable: string;
  devLabel: string;
  loadingLabel: string;
  errorLabel: string;
  authErrors: Record<AuthErrorCode, string>;
  recordings: RecordingsCopy;
};

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

/** External sticky store — survives URL strip without React setState-in-effect (B1). */
const authErrorStore: {
  code: AuthErrorCode | null;
  listeners: Set<() => void>;
} = {
  code: null,
  listeners: new Set(),
};

function subscribeAuthError(onStoreChange: () => void) {
  authErrorStore.listeners.add(onStoreChange);
  return () => {
    authErrorStore.listeners.delete(onStoreChange);
  };
}

function getAuthErrorSnapshot() {
  return authErrorStore.code;
}

function getServerAuthErrorSnapshot(): AuthErrorCode | null {
  return null;
}

function noteAuthErrorCode(code: AuthErrorCode) {
  if (authErrorStore.code === code) return;
  authErrorStore.code = code;
  for (const listener of authErrorStore.listeners) listener();
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
  recordingBaseHref,
  signInHeading,
  signedOutBody,
  googleLabel,
  googleUnavailable,
  devLabel,
  loadingLabel,
  errorLabel,
  authErrors,
  recordings,
}: Props) {
  const search = useSyncExternalStore(
    subscribeSearch,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );

  const oauthCode = useSyncExternalStore(
    subscribeAuthError,
    getAuthErrorSnapshot,
    getServerAuthErrorSnapshot,
  );

  const oauthError = useMemo(() => {
    if (!oauthCode) return null;
    return authErrors[oauthCode];
  }, [authErrors, oauthCode]);

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const error = actionError ?? oauthError;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (code && isAuthErrorCode(code)) {
      noteAuthErrorCode(code);
    }
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
      // Sync AppShell account/logout (sidebar) without a full reload.
      window.dispatchEvent(new Event("dictably:auth"));
    } catch {
      setActionError(errorLabel);
    } finally {
      setBusy(false);
    }
  }

  if (busy && !user && !config && !oauthError) {
    return (
      <>
        <h1 className="app-shell__title">{signInHeading}</h1>
        <p className="app-shell__body">{loadingLabel}</p>
      </>
    );
  }

  if (user) {
    return (
      <div className="sign-in sign-in--home">
        {error ? (
          <p className="sign-in__error" role="alert">
            {error}
          </p>
        ) : null}
        <RecordingsPanel
          copy={recordings}
          recordingBaseHref={recordingBaseHref}
        />
      </div>
    );
  }

  const googleHref = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="sign-in">
      <h1 className="app-shell__title">{signInHeading}</h1>
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
