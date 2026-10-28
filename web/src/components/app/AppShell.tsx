"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getMe, logout, type User } from "@/lib/api";

type Props = {
  /** When omitted, the child supplies the page title (e.g. SignInPanel). */
  heading?: string;
  backHref: string;
  backLabel: string;
  /** Active nav item for /app shell. */
  nav?: "recordings" | "people" | "settings";
  /** Locale-prefixed recordings home (e.g. /app/ or /uk/app/). */
  recordingsHref?: string;
  logoutLabel?: string;
  brandName?: string;
  children: ReactNode;
};

function formatBalance(seconds: number): string {
  if (seconds <= 0) return "0 m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m} m left`;
  if (m <= 0) return `${h} h left`;
  return `${h} h ${m} m left`;
}

function initials(user: User): string {
  const base = (user.name || user.email || "?").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

/** App chrome with sidebar (Recordings.dc.html + A1–A5). */
export function AppShell({
  heading,
  backHref,
  backLabel,
  nav = "recordings",
  recordingsHref = "/app/",
  logoutLabel = "Sign out",
  brandName = "Dictably",
  children,
}: Props) {
  const [user, setUser] = useState<User | null>(null);

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
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  async function onLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
      window.location.href = recordingsHref;
    }
  }

  const balance = user?.balance_seconds ?? 0;
  const showQuota = Boolean(user) && balance > 0;

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="App">
        <a href={recordingsHref} className="app-sidebar__brand">
          <span className="app-sidebar__mark" aria-hidden>
            <span className="sp-1" />
            <span className="sp-2" />
            <span className="sp-3" />
          </span>
          {brandName}
        </a>
        <nav className="app-sidebar__nav">
          <a
            href={recordingsHref}
            className={nav === "recordings" ? "is-active" : undefined}
            aria-current={nav === "recordings" ? "page" : undefined}
          >
            Recordings
          </a>
          <span className="app-sidebar__soon" aria-hidden="true">
            People
          </span>
          <span className="app-sidebar__soon" aria-hidden="true">
            Settings
          </span>
        </nav>

        <div className="app-sidebar__foot">
          {showQuota ? (
            <div className="app-sidebar__quota" data-minutes>
              <div className="app-sidebar__quota-row">
                <span>Minutes</span>
                <span className="dy-time dy-muted">{formatBalance(balance)}</span>
              </div>
              <div className="dy-progress" aria-hidden>
                <div
                  className="dy-progress__fill"
                  style={{
                    width: `${Math.min(100, Math.round((balance / (20 * 3600)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {user ? (
            <div className="app-sidebar__account" data-auth="account">
              <span className="app-sidebar__avatar" aria-hidden>
                {initials(user)}
              </span>
              <span className="app-sidebar__who">
                <span className="app-sidebar__name">
                  {user.name?.trim() || user.email.split("@")[0]}
                </span>
                <span className="app-sidebar__email">{user.email}</span>
              </span>
              <button
                type="button"
                className="btn-text app-sidebar__logout"
                data-auth="logout"
                onClick={() => void onLogout()}
              >
                {logoutLabel}
              </button>
            </div>
          ) : (
            <a href={backHref} className="app-sidebar__back">
              {backLabel}
            </a>
          )}
        </div>
      </aside>
      <main className="app-main">
        {heading ? (
          <h1 className="dy-type-title app-main__title">{heading}</h1>
        ) : null}
        {children}
      </main>
    </div>
  );
}
