import type { ReactNode } from "react";
import { site } from "@/lib/site";

type Props = {
  /** When omitted, the child supplies the page title (e.g. SignInPanel). */
  heading?: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
};

/** Minimal shell for /app and /admin. */
export function AppShell({ heading, backHref, backLabel, children }: Props) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <a href={backHref} className="brand">
          {site.name}
        </a>
      </header>
      <main className="app-shell__main shell">
        {heading ? <h1 className="app-shell__title">{heading}</h1> : null}
        {children}
        <p>
          <a href={backHref} className="btn-secondary">
            {backLabel}
          </a>
        </p>
      </main>
    </div>
  );
}
