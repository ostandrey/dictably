import { site } from "@/lib/site";

export type CookieRow = {
  name: string;
  purpose: string;
  duration: string;
};

export type PrivacyCopy = {
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  contactEmail?: string;
  sections: { h: string; body: string }[];
  cookiesTitle?: string;
  cookiesIntro?: string;
  cookiesHeaders?: { name: string; purpose: string; duration: string };
  cookies?: CookieRow[];
  back: string;
};

type Props = {
  copy: PrivacyCopy;
  homeHref: string;
};

export function PrivacyPage({ copy, homeHref }: Props) {
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
        {copy.cookies && copy.cookies.length > 0 ? (
          <section className="legal__section" data-privacy="cookies">
            <h2>{copy.cookiesTitle}</h2>
            {copy.cookiesIntro ? <p>{copy.cookiesIntro}</p> : null}
            <div className="legal__table-wrap">
              <table className="legal__table">
                <thead>
                  <tr>
                    <th scope="col">{copy.cookiesHeaders?.name ?? "Name"}</th>
                    <th scope="col">
                      {copy.cookiesHeaders?.purpose ?? "Purpose"}
                    </th>
                    <th scope="col">
                      {copy.cookiesHeaders?.duration ?? "Duration"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {copy.cookies.map((row) => (
                    <tr key={row.name}>
                      <td>
                        <code>{row.name}</code>
                      </td>
                      <td>{row.purpose}</td>
                      <td>{row.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
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
