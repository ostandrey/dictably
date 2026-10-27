import { pricing } from "@/lib/pricing";
import type { LandingCopy } from "@/lib/copy/types";
import { site } from "@/lib/site";
import { InteractiveExample } from "./InteractiveExample";
import { TallyButton } from "./TallyButton";

type Props = { copy: LandingCopy };

export function LandingPage({ copy }: Props) {
  const locale = copy.locale;

  return (
    <>
      <header className="site-header">
        <div className="shell site-header__inner">
          <a href="#top" className="brand">
            {site.name}
          </a>
          <nav className="nav" aria-label="Primary">
            <a href="#how">{copy.nav.how}</a>
            <a href="#example">{copy.nav.example}</a>
            <a href="#pricing">{copy.nav.pricing}</a>
            <a href="#faq">{copy.nav.faq}</a>
          </nav>
          <div className="site-header__actions">
            <a
              href={copy.nav.langHref}
              className="lang-switch"
              hrefLang={locale === "en" ? "uk" : "en"}
            >
              {copy.nav.langSwitch}
            </a>
            <span className="cta-full">
              <TallyButton locale={locale} label={copy.nav.cta} />
            </span>
            <span className="cta-short">
              <TallyButton locale={locale} label={copy.nav.ctaShort} />
            </span>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero shell">
          <div className="hero__copy">
            <h1 className="hero__title">{copy.hero.h1}</h1>
            <p className="hero__sub">{copy.hero.sub}</p>
            <div className="hero__cta">
              <TallyButton locale={locale} label={copy.hero.cta} />
              <a href="#example" className="btn-secondary">
                {copy.hero.secondary}
              </a>
            </div>
            <p className="hero__under">{copy.hero.under}</p>
          </div>
          <div className="hero__demo">
            <InteractiveExample copy={copy} compact />
          </div>
        </section>

        <section className="problem shell" aria-label="Problem">
          {copy.problem.lines.map((line) => (
            <p key={line} className="problem__line">
              {line}
            </p>
          ))}
        </section>

        <section id="how" className="section shell">
          <h2 className="section__title">{copy.how.title}</h2>
          <ol className="steps">
            {copy.how.steps.map((step, i) => (
              <li key={step.title} className="steps__item">
                <span className="steps__num font-mono">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="steps__title">{step.title}</h3>
                  <p className="steps__body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="example" className="section section--example shell">
          <h2 className="section__title">{copy.example.title}</h2>
          <p className="section__sub">{copy.example.subtitle}</p>
          <InteractiveExample copy={copy} />
        </section>

        <section id="why" className="section shell">
          <h2 className="section__title">{copy.why.title}</h2>
          <ul className="why">
            {copy.why.items.map((item) => (
              <li key={item.title} className="why__item">
                <h3 className="why__title">{item.title}</h3>
                <p className="why__body">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="section shell">
          <div className="section__head">
            <h2 className="section__title">{copy.pricing.title}</h2>
            <span className="badge">{copy.pricing.planned}</span>
          </div>
          <ul className="pricing">
            <li className="pricing__item">
              <h3 className="pricing__title">{copy.pricing.proTitle}</h3>
              <p className="pricing__body">{copy.pricing.proBody}</p>
            </li>
            <li className="pricing__item">
              <h3 className="pricing__title">{copy.pricing.packTitle}</h3>
              <p className="pricing__body">{copy.pricing.packBody}</p>
            </li>
            {pricing.founding.enabled ? (
              <li className="pricing__item pricing__item--founding">
                <h3 className="pricing__title">{copy.pricing.foundingTitle}</h3>
                <p className="pricing__body">{copy.pricing.foundingBody}</p>
                <TallyButton
                  locale={locale}
                  label={copy.pricing.foundingCta}
                  variant="secondary"
                />
              </li>
            ) : null}
          </ul>
        </section>

        <section id="faq" className="section shell">
          <h2 className="section__title">{copy.faq.title}</h2>
          <div className="faq">
            {copy.faq.items.map((item) => (
              <details key={item.q} className="faq__item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final shell">
          <h2 className="final__title">{copy.final.h2}</h2>
          <TallyButton locale={locale} label={copy.final.cta} />
          <p className="final__under">{copy.final.under}</p>
        </section>
      </main>

      <footer className="site-footer shell">
        <span>{copy.footer.rights}</span>
        <div className="site-footer__links">
          <a href={copy.nav.privacyHref}>{copy.footer.privacy}</a>
          <a href={`mailto:${site.contactEmail}`}>{copy.footer.contact}</a>
        </div>
      </footer>
    </>
  );
}
