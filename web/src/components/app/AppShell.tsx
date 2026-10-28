import type { ReactNode } from "react";
import { site } from "@/lib/site";

type Props = {
  heading: string;
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
        <h1 className="app-shell__title">{heading}</h1>
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
