import { site } from "@/lib/site";

/** Shared shell for Terms (and similar) legal docs. */
export type LegalDocCopy = {
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  contactEmail?: string;
  sections: { h: string; body: string }[];
  back: string;
};

type Props = {
  copy: LegalDocCopy;
  homeHref: string;
};

export function LegalDocPage({ copy, homeHref }: Props) {
  return (
    <>
      <header className="site-header">
        <div className="shell site-header__inner">
          <a href={homeHref} className="brand">
            {site.name}
          </a>
        </div>
      </header>
      <main className="shell legal">
        <p className="legal__back">
          <a href={homeHref}>{copy.back}</a>
        </p>
        <h1 className="legal__title">{copy.h1}</h1>
        <p className="legal__intro">{copy.intro}</p>
        {copy.sections.map((section) => (
          <section key={section.h} className="legal__section">
            <h2>{section.h}</h2>
            {section.body.split("\n\n").map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
          </section>
        ))}
      </main>
      <footer className="site-footer shell">
        <span>© {site.name}</span>
        {copy.contactEmail ? (
          <a href={`mailto:${copy.contactEmail}`}>{copy.contactEmail}</a>
        ) : null}
      </footer>
    </>
  );
}
