"use client";

import { type ReactNode } from "react";
import { AccountMenu } from "@/components/app/AccountMenu";
import { AppLink } from "@/components/app/AppLink";
import { clearAuthSession, useAuth } from "@/components/app/AuthProvider";
import { AudioLines, Settings, Users } from "@/components/icons";
import { logout } from "@/lib/api";
import { formatBalanceSeconds } from "@/lib/mediaDuration";

type Props = {
  /** When omitted, the child supplies the page title (e.g. SignInPanel). */
  heading?: string;
  backHref: string;
  backLabel: string;
  /** Active nav item for /app shell. */
  nav?: "recordings" | "people" | "settings" | "admin";
  /** Locale-prefixed recordings home (e.g. /app/ or /uk/app/). */
  recordingsHref?: string;
  settingsHref?: string;
  peopleHref?: string;
  adminHref?: string;
  logoutLabel?: string;
  brandName?: string;
  navRecordings?: string;
  navPeople?: string;
  navSettings?: string;
  navAdmin?: string;
  /** Sidebar quota label (T-047 F2): EN «Minutes» / UK «Залишилось». */
  quotaLabel?: string;
  /** Locale for balance formatting (T-047 F2). */
  uiLocale?: string;
  /** On settings page: show quota + account in main (mobile M1). */
  showAccountInMain?: boolean;
  children: ReactNode;
};


function SkeletonChrome() {
  return (
    <div className="app-frame" data-shell="skeleton" aria-busy="true">
      <aside className="app-sidebar" aria-hidden>
        <div className="app-skel app-skel--brand" />
        <div className="app-sidebar__nav">
          <div className="app-skel app-skel--nav" />
          <div className="app-skel app-skel--nav" />
          <div className="app-skel app-skel--nav" />
        </div>
        <div className="app-sidebar__foot">
          <div className="app-skel app-skel--account" />
        </div>
      </aside>
      <main className="app-main">
        <div className="app-skel app-skel--title" />
        <div className="app-skel app-skel--block" />
        <div className="app-skel app-skel--block app-skel--short" />
      </main>
    </div>
  );
}

/** App chrome with sidebar (Recordings.dc.html + A1–A5 + M1 mobile nav). */
export function AppShell({
  heading,
  backHref,
  backLabel,
  nav = "recordings",
  recordingsHref = "/app/",
  settingsHref = "/app/settings/",
  peopleHref = "/app/people/",
  adminHref = "/admin/",
  logoutLabel = "Sign out",
  brandName = "Dictably",
  navRecordings = "Recordings",
  navPeople = "People",
  navSettings = "Settings",
  navAdmin = "Admin",
  quotaLabel = "Minutes",
  uiLocale = "en",
  showAccountInMain = false,
  children,
}: Props) {
  const { status, user, setUser } = useAuth();

  if (status === "loading") {
    return <SkeletonChrome />;
  }

  async function onLogout() {
    try {
      await logout();
    } catch {
      /* still clear client session */
    }
    clearAuthSession();
    setUser(null);
    const path = window.location.pathname;
    if (
      path !== recordingsHref &&
      path !== recordingsHref.replace(/\/+$/, "")
    ) {
      window.location.assign(recordingsHref);
    }
  }

  const balance = user?.balance_seconds ?? 0;
  const showQuota = Boolean(user) && balance > 0;

  const accountBlock = user ? (
    <AccountMenu
      user={user}
      logoutLabel={logoutLabel}
      onLogout={() => void onLogout()}
    />
  ) : (
    <AppLink href={backHref} className="app-sidebar__back">
      {backLabel}
    </AppLink>
  );

  const quotaBlock = showQuota ? (
    <div className="app-sidebar__quota" data-minutes>
      <div className="app-sidebar__quota-row">
        <span>{quotaLabel}</span>
        <span className="dy-time dy-muted">
          {formatBalanceSeconds(balance, { locale: uiLocale })}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <div className="app-frame">
      <aside
        className="app-sidebar"
        aria-label="App"
        data-shell="sidebar"
        style={{ viewTransitionName: "app-sidebar" }}
      >
        <AppLink href={recordingsHref} className="app-sidebar__brand">
          <span className="app-sidebar__mark" aria-hidden>
            <span className="sp-1" />
            <span className="sp-2" />
            <span className="sp-3" />
          </span>
          {brandName}
        </AppLink>
        <nav className="app-sidebar__nav" data-shell="sidebar-nav">
          <AppLink
            href={recordingsHref}
            className={nav === "recordings" ? "is-active" : undefined}
            aria-current={nav === "recordings" ? "page" : undefined}
          >
            <AudioLines size={16} strokeWidth={1.5} aria-hidden className="app-nav__icon" />
            {navRecordings}
          </AppLink>
          <AppLink
            href={peopleHref}
            className={nav === "people" ? "is-active" : undefined}
            aria-current={nav === "people" ? "page" : undefined}
          >
            <Users size={16} strokeWidth={1.5} aria-hidden className="app-nav__icon" />
            {navPeople}
          </AppLink>
          <AppLink
            href={settingsHref}
            className={nav === "settings" ? "is-active" : undefined}
            aria-current={nav === "settings" ? "page" : undefined}
          >
            <Settings size={16} strokeWidth={1.5} aria-hidden className="app-nav__icon" />
            {navSettings}
          </AppLink>
          {user?.role === "admin" ? (
            <AppLink
              href={adminHref}
              className={nav === "admin" ? "is-active" : undefined}
              aria-current={nav === "admin" ? "page" : undefined}
              data-nav="admin"
            >
              {navAdmin}
            </AppLink>
          ) : null}
        </nav>

        <div className="app-sidebar__foot" data-shell="sidebar-foot">
          {quotaBlock}
          {accountBlock}
        </div>
      </aside>

      <main
        className="app-main"
        style={{ viewTransitionName: "app-main" }}
      >
        {heading ? (
          <h1 className="dy-type-title app-main__title">{heading}</h1>
        ) : null}
        {showAccountInMain ? (
          <div className="app-settings-mobile" data-shell="settings-main">
            {/* S6: minutes live in SettingsPanel billing — no duplicate quota here */}
            {accountBlock}
          </div>
        ) : null}
        {children}
      </main>

      <nav className="app-bottom-nav" aria-label="Primary" data-shell="bottom-nav">
        <AppLink
          href={recordingsHref}
          className={nav === "recordings" ? "is-active" : undefined}
          aria-current={nav === "recordings" ? "page" : undefined}
        >
          <AudioLines size={20} strokeWidth={1.5} aria-hidden className="app-nav__icon" />
          {navRecordings}
        </AppLink>
        <AppLink
          href={peopleHref}
          className={nav === "people" ? "is-active" : undefined}
          aria-current={nav === "people" ? "page" : undefined}
        >
          <Users size={20} strokeWidth={1.5} aria-hidden className="app-nav__icon" />
          {navPeople}
        </AppLink>
        <AppLink
          href={settingsHref}
          className={nav === "settings" ? "is-active" : undefined}
          aria-current={nav === "settings" ? "page" : undefined}
        >
          <Settings size={20} strokeWidth={1.5} aria-hidden className="app-nav__icon" />
          {navSettings}
        </AppLink>
        {user?.role === "admin" ? (
          <AppLink
            href={adminHref}
            className={nav === "admin" ? "is-active" : undefined}
            aria-current={nav === "admin" ? "page" : undefined}
            data-nav="admin"
          >
            {navAdmin}
          </AppLink>
        ) : null}
      </nav>
    </div>
  );
}
