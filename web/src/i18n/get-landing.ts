import { getTranslations } from "next-intl/server";
import { pricing } from "@/lib/pricing";
import type { LandingCopy } from "@/lib/copy/types";
import { localePath } from "./locales";

export async function getLandingCopy(locale: string): Promise<LandingCopy> {
  const t = await getTranslations({ locale });
  const money = (n: number) => `$${n}`;

  return {
    locale: locale as "en" | "uk",
    meta: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
    nav: {
      how: t("nav.how"),
      pricing: t("nav.pricing"),
      faq: t("nav.faq"),
      cta: t("nav.cta"),
      ctaShort: t("nav.ctaShort"),
      signIn: t("nav.signIn"),
      langSwitch: locale === "en" ? "Українська" : "English",
      langHref: locale === "en" ? localePath("uk") : localePath("en"),
      privacyHref: localePath(locale, "privacy"),
      termsHref: localePath(locale, "terms"),
    },
    hero: {
      badge: t("hero.badge"),
      h1: t("hero.h1"),
      sub: t("hero.sub"),
      cta: t("hero.cta"),
      secondary: t("hero.secondary"),
      under: t("hero.under"),
    },
    problem: {
      lead: t("problem.lead"),
      lines: [t("problem.line1"), t("problem.line2")],
      proof: t("problem.proof"),
    },
    how: {
      title: t("how.title"),
      steps: [
        { title: t("how.step1Title"), body: t("how.step1Body") },
        { title: t("how.step2Title"), body: t("how.step2Body") },
        { title: t("how.step3Title"), body: t("how.step3Body") },
      ],
    },
    example: {
      title: t("example.title"),
      subtitle: t("example.subtitle"),
      hint: t("example.hint"),
      transcriptLabel: t("example.transcriptLabel"),
      minutesLabel: t("example.minutesLabel"),
    },
    why: {
      items: [
        { title: t("why.item1Title"), body: t("why.item1Body") },
        { title: t("why.item2Title"), body: t("why.item2Body") },
        { title: t("why.item3Title"), body: t("why.item3Body") },
        { title: t("why.item4Title"), body: t("why.item4Body") },
      ],
    },
    pricing: {
      title: t("pricing.title"),
      packTitle: t("pricing.packTitle"),
      packPrice: money(pricing.pack.price),
      packMeta: t("pricing.packMeta", { hours: pricing.pack.hours }),
      packBody: t("pricing.packBody", {
        months: pricing.pack.validityMonths,
      }),
      packCta: t("pricing.packCta"),
      proTitle: t("pricing.proTitle"),
      proPrice: money(pricing.pro.priceMonthly),
      proMeta: t("pricing.proMeta"),
      proBody: t("pricing.proBody", { hours: pricing.pro.hours }),
      proCta: t("pricing.proCta"),
      foundingTitle: t("pricing.foundingTitle"),
      foundingBadge: t("pricing.foundingBadge", {
        seats: pricing.founding.seats,
      }),
      foundingPrice: money(pricing.founding.priceMonthly),
      foundingMeta: t("pricing.foundingMeta"),
      foundingBody: t("pricing.foundingBody"),
      foundingCta: t("pricing.foundingCta"),
    },
    faq: {
      title: t("faq.title"),
      items: [
        { q: t("faq.q1"), a: t("faq.a1") },
        { q: t("faq.q2"), a: t("faq.a2") },
        { q: t("faq.q3"), a: t("faq.a3") },
        { q: t("faq.q4"), a: t("faq.a4") },
        { q: t("faq.q5"), a: t("faq.a5") },
        { q: t("faq.q6"), a: t("faq.a6") },
      ],
    },
    final: {
      h2: t("final.h2"),
      cta: t("final.cta"),
      under: t("final.under"),
    },
    footer: {
      privacy: t("footer.privacy"),
      terms: t("footer.terms"),
      contact: t("footer.contact"),
      rights: t("footer.rights"),
    },
  };
}

export async function getPrivacyCopy(locale: string) {
  const t = await getTranslations({ locale, namespace: "privacy" });
  const { site, isPreview } = await import("@/lib/site");
  const whoBody = isPreview || !site.contactEmail
    ? t("whoBodyPreview", { controller: site.controller })
    : t("whoBody", {
        controller: site.controller,
        email: site.contactEmail,
      });
  const rightsBody = isPreview || !site.contactEmail
    ? t("rightsBodyPreview")
    : t("rightsBody", { email: site.contactEmail });
  return {
    title: t("title"),
    metaDescription: t("metaDescription"),
    h1: t("h1"),
    intro: t("intro"),
    contactEmail: site.contactEmail,
    sections: [
      {
        h: t("whoTitle"),
        body: whoBody,
      },
      { h: t("collectTitle"), body: t("collectBody") },
      { h: t("processTitle"), body: t("processBody") },
      { h: t("dontTitle"), body: t("dontBody") },
      {
        h: t("rightsTitle"),
        body: rightsBody,
      },
      {
        h: t("changesTitle"),
        body: t("changesBody", { date: site.privacyUpdated }),
      },
    ],
    cookiesTitle: t("cookiesTitle"),
    cookiesIntro: t("cookiesIntro"),
    cookiesHeaders: {
      name: t("cookiesColName"),
      purpose: t("cookiesColPurpose"),
      duration: t("cookiesColDuration"),
    },
    cookies: [
      {
        name: "dictably_session",
        purpose: t("cookieSessionPurpose"),
        duration: t("cookieSessionDuration"),
      },
      {
        name: "dictably_csrf",
        purpose: t("cookieCsrfPurpose"),
        duration: t("cookieCsrfDuration"),
      },
      {
        name: "dictably_oauth_state",
        purpose: t("cookieOauthPurpose"),
        duration: t("cookieOauthDuration"),
      },
    ],
    back: t("back"),
  };
}

export async function getTermsCopy(locale: string) {
  const t = await getTranslations({ locale, namespace: "terms" });
  const { site, isPreview } = await import("@/lib/site");
  return {
    title: t("title"),
    metaDescription: t("metaDescription"),
    h1: t("h1"),
    intro: t("intro", { date: site.privacyUpdated }),
    contactEmail: isPreview ? undefined : site.contactEmail,
    sections: [
      { h: t("serviceTitle"), body: t("serviceBody") },
      { h: t("accountTitle"), body: t("accountBody") },
      { h: t("contentTitle"), body: t("contentBody") },
      { h: t("acceptableTitle"), body: t("acceptableBody") },
      { h: t("liabilityTitle"), body: t("liabilityBody") },
      { h: t("changesTitle"), body: t("changesBody", { date: site.privacyUpdated }) },
    ],
    back: t("back"),
  };
}
