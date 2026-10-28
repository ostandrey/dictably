import type { ReactNode } from "react";
import { site } from "@/lib/site";

type Props = {
  /** When omitted, the child supplies the page title (e.g. SignInPanel). */
  heading?: string;
  backHref: string;
  backLabel: string;
  /** Active nav item for /app shell. */
  nav?: "recordings" | "people" | "settings";
  children: ReactNode;
};

/** App chrome with sidebar (T-004 / design/IA.md). Minutes counter = stub until T-020. */
export function AppShell({
  heading,
  backHref,
  backLabel,
  nav = "recordings",
  children,
}: Props) {
  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="App">
        <a href={backHref} className="app-sidebar__brand">
          <span className="app-sidebar__mark" aria-hidden>
            <span className="sp-1" />
            <span className="sp-2" />
            <span className="sp-3" />
          </span>
          {site.name}
        </a>
        <nav className="app-sidebar__nav">
          <a
            href="#recordings"
            className={nav === "recordings" ? "is-active" : undefined}
            aria-current={nav === "recordings" ? "page" : undefined}
          >
            Recordings
          </a>
          <span className="app-sidebar__soon" title="Coming later">
            People
          </span>
          <span className="app-sidebar__soon" title="Coming later">
            Settings
          </span>
        </nav>
        <div className="app-sidebar__quota" data-minutes-stub>
          <div className="app-sidebar__quota-row">
            <span>Minutes</span>
            <span className="dy-time dy-muted">—</span>
          </div>
          <div className="dy-progress" aria-hidden>
            <div className="dy-progress__fill" style={{ width: "0%" }} />
          </div>
          <p className="dy-muted" style={{ margin: 0, fontSize: 13 }}>
            Quota after sign-in · T-020
          </p>
        </div>
        <a href={backHref} className="app-sidebar__back">
          {backLabel}
        </a>
      </aside>
      <main className="app-main">
        {heading ? <h1 className="dy-type-title app-main__title">{heading}</h1> : null}
        {children}
      </main>
    </div>
  );
}
