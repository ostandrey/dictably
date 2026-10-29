"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/app/AuthProvider";
import { IllEmptyRecordings } from "@/components/illustrations";
import { Alert } from "@/components/ui";
import { devLogin } from "@/lib/api";
import { currentAppNext, sanitizeNextPath } from "@/lib/safeNext";

const AUTH_ERROR_CODES = [
  "access_denied",
  "invalid_state",
  "email_unverified",
  "oauth_failed",
  "incomplete_profile",
] as const;

type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type SignInCopy = {
  brandName: string;
  title: string;
  subtitle: string;
  asideTitle: string;
  googleLabel: string;
  legalBefore: string;
  termsLabel: string;
  legalAnd: string;
  privacyLabel: string;
  legalAfter: string;
  termsHref: string;
  privacyHref: string;
  point1: string;
  point2: string;
  point3: string;
  devSection: string;
  devLabel: string;
  googleUnavailable: string;
  errorLabel: string;
  authErrors: Record<AuthErrorCode, string>;
};

type Props = {
  locale: "en" | "uk";
  /** Preferred return path; defaults to current URL. */
  nextPath?: string;
  homeFallback: string;
  copy: SignInCopy;
};

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

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

/** Official Google "G" mark (4-color) — brand guidelines for sign-in buttons. */
function GoogleMark() {
  return (
    <svg className="auth-screen__g" viewBox="0 0 24 24" aria-hidden width="18" height="18">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function PointIcon({ kind }: { kind: "mic" | "sides" | "lock" }) {
  if (kind === "mic") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <rect x="6" y="2" width="4" height="7" rx="2" fill="var(--accent)" />
        <path
          d="M3.5 8a4.5 4.5 0 0 0 9 0"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M8 12.5v1.5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "sides") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <rect x="2" y="4" width="5" height="8" rx="1.5" fill="var(--speaker-1)" opacity="0.9" />
        <rect x="9" y="4" width="5" height="8" rx="1.5" fill="var(--speaker-2)" opacity="0.9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="var(--accent-soft)" stroke="var(--accent)" />
      <path
        d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SignInScreen({ locale, nextPath, homeFallback, copy }: Props) {
  const { config, setUser } = useAuth();
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
    return copy.authErrors[oauthCode];
  }, [copy.authErrors, oauthCode]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const error = actionError ?? oauthError;

  const resolvedNext = sanitizeNextPath(
    nextPath || (typeof window !== "undefined" ? currentAppNext(homeFallback) : homeFallback),
    homeFallback,
  );

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

  async function onDevLogin() {
    setBusy(true);
    setActionError(null);
    try {
      const me = await devLogin();
      setUser(me);
      window.dispatchEvent(new Event("dictably:auth"));
      const dest = sanitizeNextPath(resolvedNext, homeFallback);
      const here = `${window.location.pathname}${window.location.search}`;
      if (dest !== here && dest !== window.location.pathname) {
        window.location.assign(dest);
      }
    } catch {
      setActionError(copy.errorLabel);
    } finally {
      setBusy(false);
    }
  }

  const googleHref = `/api/auth/google/start?next=${encodeURIComponent(resolvedNext)}`;
  const showGoogle = Boolean(config?.google);
  const showDev = Boolean(config?.dev_login);
  const points = [
    { text: copy.point1, kind: "mic" as const },
    { text: copy.point2, kind: "sides" as const },
    { text: copy.point3, kind: "lock" as const },
  ];

  return (
    <div className="auth-screen" data-auth="screen" data-locale={locale}>
      <aside className="auth-screen__aside">
        <div className="auth-screen__brand">
          <span className="auth-screen__mark" aria-hidden>
            <span className="sp-1" />
            <span className="sp-2" />
            <span className="sp-3" />
          </span>
          {copy.brandName}
        </div>
        <div className="auth-screen__stack">
          <h2 className="auth-screen__aside-title">{copy.asideTitle}</h2>
          <div className="auth-screen__ill" aria-hidden>
            <IllEmptyRecordings />
          </div>
          <ul className="auth-screen__points">
            {points.map((p) => (
              <li key={p.kind}>
                <span className="auth-screen__point-icon" aria-hidden>
                  <PointIcon kind={p.kind} />
                </span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="auth-screen__main">
        <div className="auth-screen__mobile-ill" aria-hidden>
          <IllEmptyRecordings />
        </div>
        <div className="auth-screen__card" data-auth="card">
          <h1 className="auth-screen__title">{copy.title}</h1>
          <p className="auth-screen__subtitle">{copy.subtitle}</p>

          {error ? (
            <Alert tone="danger" data-auth="error">
              {error}
            </Alert>
          ) : null}

          {showGoogle ? (
            <a className="auth-screen__google" href={googleHref} data-auth="google">
              <GoogleMark />
              <span>{copy.googleLabel}</span>
            </a>
          ) : null}

          <p className="auth-screen__legal">
            {copy.legalBefore}{" "}
            <a href={copy.termsHref} target="_blank" rel="noreferrer">
              {copy.termsLabel}
            </a>{" "}
            {copy.legalAnd}{" "}
            <a href={copy.privacyHref} target="_blank" rel="noreferrer">
              {copy.privacyLabel}
            </a>
            {copy.legalAfter}
          </p>

          {showDev ? (
            <div className="auth-screen__dev" data-auth="dev">
              <div className="auth-screen__sep" role="separator">
                <span>{copy.devSection}</span>
              </div>
              {!showGoogle ? (
                <p className="auth-screen__dev-hint">{copy.googleUnavailable}</p>
              ) : null}
              <button
                type="button"
                className="btn-secondary auth-screen__dev-btn"
                onClick={() => void onDevLogin()}
                disabled={busy}
                data-auth="dev-login"
              >
                {copy.devLabel}
              </button>
            </div>
          ) : null}

          {!showGoogle && !showDev ? (
            <p className="auth-screen__dev-hint">{copy.googleUnavailable}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
