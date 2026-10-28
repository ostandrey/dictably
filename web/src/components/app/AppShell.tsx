import { site } from "@/lib/site";

type Props = {
  heading: string;
  body: string;
  backHref: string;
  backLabel: string;
};

/** Minimal shell for /app and /admin (auth arrives in T-011). */
export function AppShell({ heading, body, backHref, backLabel }: Props) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <a href={backHref} className="brand">
          {site.name}
        </a>
      </header>
      <main className="app-shell__main shell">
        <h1 className="app-shell__title">{heading}</h1>
        <p className="app-shell__body">{body}</p>
        <p>
          <a href={backHref} className="btn-secondary">
            {backLabel}
          </a>
        </p>
      </main>
    </div>
  );
}
