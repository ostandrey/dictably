export type FaqItem = { q: string; a: string };

export type MinutesItem = {
  id: string;
  text: string;
  time: string; // mm:ss
  seconds: number;
  note?: string;
};

export type MinutesGroup = {
  id: string;
  title: string;
  items: MinutesItem[];
};

export type TranscriptLine = {
  id: string;
  speaker: string;
  speakerTone: "ochre" | "teal" | "plum" | "olive" | "slate" | "rust";
  time: string;
  seconds: number;
  text: string;
};

export type LandingCopy = {
  locale: "en" | "uk";
  meta: {
    title: string;
    description: string;
  };
  nav: {
    how: string;
    pricing: string;
    faq: string;
    cta: string;
    ctaShort: string;
    signIn: string;
    langSwitch: string;
    langHref: string;
    privacyHref: string;
  };
  hero: {
    badge: string;
    h1: string;
    sub: string;
    cta: string;
    secondary: string;
    under: string;
  };
  problem: {
    lead: string;
    lines: string[];
    proof: string;
  };
  how: {
    title: string;
    steps: { title: string; body: string }[];
  };
  example: {
    title: string;
    subtitle: string;
    hint: string;
    transcriptLabel: string;
    minutesLabel: string;
  };
  why: {
    items: { title: string; body: string }[];
  };
  pricing: {
    title: string;
    packTitle: string;
    packPrice: string;
    packMeta: string;
    packBody: string;
    packCta: string;
    proTitle: string;
    proPrice: string;
    proMeta: string;
    proBody: string;
    proCta: string;
    foundingTitle: string;
    foundingBadge: string;
    foundingPrice: string;
    foundingMeta: string;
    foundingBody: string;
    foundingCta: string;
  };
  faq: {
    title: string;
    items: FaqItem[];
  };
  final: {
    h2: string;
    cta: string;
    under: string;
  };
  footer: {
    privacy: string;
    contact: string;
    rights: string;
  };
};
