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
      example: t("nav.example"),
      pricing: t("nav.pricing"),
      faq: t("nav.faq"),
      cta: t("nav.cta"),
      ctaShort: t("nav.ctaShort"),
      langSwitch: locale === "en" ? "Українська" : "English",
      langHref: locale === "en" ? localePath("uk") : localePath("en"),
      privacyHref: localePath(locale, "privacy"),
    },
    hero: {
      h1: t("hero.h1"),
      sub: t("hero.sub"),
      cta: t("hero.cta"),
      secondary: t("hero.secondary"),
      under: t("hero.under"),
    },
    problem: {
      lines: [t("problem.line1"), t("problem.line2"), t("problem.line3")],
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
      title: t("why.title"),
      items: [
        { title: t("why.item1Title"), body: t("why.item1Body") },
        { title: t("why.item2Title"), body: t("why.item2Body") },
        { title: t("why.item3Title"), body: t("why.item3Body") },
        { title: t("why.item4Title"), body: t("why.item4Body") },
        { title: t("why.item5Title"), body: t("why.item5Body") },
      ],
    },
    pricing: {
      title: t("pricing.title"),
      planned: t("pricing.planned"),
      proTitle: t("pricing.proTitle", { price: money(pricing.pro.priceMonthly) }),
      proBody: t("pricing.proBody", { hours: pricing.pro.hours }),
      packTitle: t("pricing.packTitle", { price: money(pricing.pack.price) }),
      packBody: t("pricing.packBody", {
        hours: pricing.pack.hours,
        months: pricing.pack.validityMonths,
      }),
      foundingTitle: t("pricing.foundingTitle", {
        price: money(pricing.founding.priceMonthly),
      }),
      foundingBody: t("pricing.foundingBody", {
        seats: pricing.founding.seats,
      }),
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
      contact: t("footer.contact"),
      rights: t("footer.rights"),
    },
  };
}

export async function getPrivacyCopy(locale: string) {
  const t = await getTranslations({ locale, namespace: "privacy" });
  const { site } = await import("@/lib/site");
  return {
    title: t("title"),
    metaDescription: t("metaDescription"),
    h1: t("h1"),
    intro: t("intro"),
    sections: [
      {
        h: t("whoTitle"),
        body: t("whoBody", {
          controller: site.controller,
          email: site.contactEmail,
        }),
      },
      { h: t("collectTitle"), body: t("collectBody") },
      { h: t("processTitle"), body: t("processBody") },
      { h: t("dontTitle"), body: t("dontBody") },
      {
        h: t("rightsTitle"),
        body: t("rightsBody", { email: site.contactEmail }),
      },
      {
        h: t("changesTitle"),
        body: t("changesBody", { date: site.privacyUpdated }),
      },
    ],
    back: t("back"),
  };
}
