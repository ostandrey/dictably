import Script from "next/script";
import { pricing } from "@/lib/pricing";
import type { LandingCopy } from "@/lib/copy/types";
import { site } from "@/lib/site";
import { ProductExample } from "./ProductExample";
import { HeroSignature } from "./HeroSignature";
import { AppCtaLink } from "./AppCtaLink";
import { SiteHeader } from "./SiteHeader";
import { WhyIcons } from "./WhyIcons";

type Props = { copy: LandingCopy };

export function LandingPage({ copy }: Props) {
  const locale = copy.locale;
  const appHref = locale === "uk" ? "/uk/app/" : "/app/";
  const iconKeys = ["proof", "sides", "langs", "privacy"] as const;

  return (
    <>
      {/* Landing-only — keep off /app to protect Lighthouse (T-036 B3). */}
      <Script src="/landing.js" strategy="lazyOnload" />
      <SiteHeader copy={copy} appHref={appHref} brandName={site.name} />

      <main id="top">
        {/* 2 · Hero */}
        <section className="lp-hero" data-hero-demo>
          <div className="lp-shell lp-hero__inner">
            <div className="lp-hero__copy">
              <span className="lp-hero__badge">
                <span className="lp-hero__badge-dot" aria-hidden />
                {copy.hero.badge}
              </span>
              <h1 className="lp-hero__title hero__title">{copy.hero.h1}</h1>
              <p className="lp-hero__sub">{copy.hero.sub}</p>
              <div className="lp-hero__cta hero__cta">
                <AppCtaLink locale={locale} label={copy.hero.cta} />
                <a href="#example" className="btn-secondary">
                  {copy.hero.secondary}
                </a>
              </div>
              <p className="lp-hero__under">{copy.hero.under}</p>
            </div>
            <div className="lp-hero__visual">
              <HeroSignature />
            </div>
          </div>
        </section>

        {/* 3 · Problem */}
        <section className="lp-section" aria-label="Problem">
          <div className="lp-shell lp-problem">
            <h2 className="lp-problem__lead">{copy.problem.lead}</h2>
            <div className="lp-problem__body">
              {copy.problem.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="lp-problem__proof">{copy.problem.proof}</p>
            </div>
          </div>
        </section>

        {/* 4 · Product example */}
        <section id="example" className="lp-section lp-section--band">
          <div className="lp-shell lp-example">
            <div>
              <h2 className="lp-section__title">{copy.example.title}</h2>
              <p className="lp-section__sub">{copy.example.subtitle}</p>
            </div>
            <div className="lp-example__frame">
              <ProductExample copy={copy} />
            </div>
          </div>
        </section>

        {/* 5 · How it works (tinted) */}
        <section id="how" className="lp-section lp-section--tint">
          <div className="lp-shell lp-how">
            <h2 className="lp-section__title">{copy.how.title}</h2>
            <ol className="lp-how__grid">
              {copy.how.steps.map((step, i) => (
                <li key={step.title} className="lp-how__card">
                  <span
                    className={`lp-how__num lp-how__num--${(i + 1) as 1 | 2 | 3}`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6 · Why */}
        <section id="why" className="lp-section">
          <div className="lp-shell">
            <ul className="lp-why">
              {copy.why.items.map((item, i) => {
                const key = iconKeys[i] ?? "proof";
                return (
                  <li key={item.title}>
                    <span
                      className={`lp-why__icon lp-why__icon--${
                        (
                          ["evidence", "warning", "accent", "success"] as const
                        )[i] ?? "accent"
                      }`}
                      aria-hidden
                    >
                      <WhyIcons name={key} />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* 7 · Pricing */}
        <section id="pricing" className="lp-section lp-section--band">
          <div className="lp-shell lp-pricing">
            <h2 className="lp-section__title">{copy.pricing.title}</h2>
            <ul className="lp-pricing__grid">
              <li className="lp-price">
                <span className="lp-price__name">{copy.pricing.packTitle}</span>
                <span className="lp-price__amount">
                  {copy.pricing.packPrice}{" "}
                  <span>{copy.pricing.packMeta}</span>
                </span>
                <p className="lp-price__body">{copy.pricing.packBody}</p>
                <AppCtaLink
                  locale={locale}
                  label={copy.pricing.packCta}
                  variant="secondary"
                />
              </li>
              <li className="lp-price">
                <span className="lp-price__name">{copy.pricing.proTitle}</span>
                <span className="lp-price__amount">
                  {copy.pricing.proPrice}{" "}
                  <span>{copy.pricing.proMeta}</span>
                </span>
                <p className="lp-price__body">{copy.pricing.proBody}</p>
                <AppCtaLink
                  locale={locale}
                  label={copy.pricing.proCta}
                  variant="secondary"
                />
              </li>
              {pricing.founding.enabled ? (
                <li className="lp-price lp-price--founding">
                  <span className="lp-price__name">
                    {copy.pricing.foundingTitle}
                    <span className="dy-badge dy-badge--accent">
                      {copy.pricing.foundingBadge}
                    </span>
                  </span>
                  <span className="lp-price__amount">
                    {copy.pricing.foundingPrice}{" "}
                    <span>{copy.pricing.foundingMeta}</span>
                  </span>
                  <p className="lp-price__body">{copy.pricing.foundingBody}</p>
                  <AppCtaLink locale={locale} label={copy.pricing.foundingCta} />
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        {/* 8 · FAQ */}
        <section id="faq" className="lp-section">
          <div className="lp-shell lp-faq">
            <h2 className="lp-section__title">{copy.faq.title}</h2>
            <div className="lp-faq__list">
              {copy.faq.items.map((item) => (
                <details key={item.q} className="lp-faq__item">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 9 · Final CTA */}
        <section className="lp-final" data-final-cta>
          <div className="lp-shell lp-final__inner">
            <div className="lp-final__copy">
              <h2 className="lp-final__title">{copy.final.h2}</h2>
              <p className="lp-final__under">{copy.final.under}</p>
            </div>
            <AppCtaLink locale={locale} label={copy.final.cta} />
          </div>
        </section>
      </main>

      <footer className="lp-footer" data-site-footer>
        <div className="lp-shell lp-footer__inner">
          <span>{copy.footer.rights}</span>
          <div className="lp-footer__links">
            <a href={copy.nav.privacyHref}>{copy.footer.privacy}</a>
            <a href={copy.nav.langHref} hrefLang={locale === "en" ? "uk" : "en"}>
              {copy.nav.langSwitch}
            </a>
            {site.contactEmail ? (
              <a href={`mailto:${site.contactEmail}`}>{copy.footer.contact}</a>
            ) : null}
          </div>
        </div>
      </footer>

      <div className="sticky-cta" data-sticky-cta aria-hidden="true">
        <div className="sticky-cta__inner">
          <AppCtaLink locale={locale} label={copy.hero.cta} />
        </div>
      </div>
    </>
  );
}
