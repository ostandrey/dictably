"use client";

import { useEffect, useId, useState } from "react";
import type { LandingCopy } from "@/lib/copy/types";

type Props = {
  copy: LandingCopy;
  appHref: string;
  brandName: string;
};

export function SiteHeader({ copy, appHref, brandName }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const locale = copy.locale;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header className="lp-header">
      <div className="lp-shell lp-header__inner">
        <a href="#top" className="lp-brand" onClick={closeMenu}>
          <span className="lp-brand__mark" aria-hidden>
            <span className="sp-1" />
            <span className="sp-2" />
            <span className="sp-3" />
          </span>
          {brandName}
        </a>

        <nav className="lp-nav" aria-label="Primary">
          <a href="#how">{copy.nav.how}</a>
          <a href="#pricing">{copy.nav.pricing}</a>
          <a href="#faq">{copy.nav.faq}</a>
        </nav>

        <div className="lp-header__actions">
          <a
            href={copy.nav.langHref}
            className="lp-lang lp-header__desktop-only"
            hrefLang={locale === "en" ? "uk" : "en"}
          >
            {copy.nav.langSwitch}
          </a>
          <a
            href={appHref}
            className="btn-text lp-header__desktop-only"
            data-cta="signin"
          >
            {copy.nav.signIn}
          </a>
          <span className="cta-full">
            <a href={appHref} className="btn-primary" data-cta="app">
              {copy.nav.cta}
            </a>
          </span>
          <span className="cta-short">
            <a href={appHref} className="btn-primary" data-cta="app">
              {copy.nav.ctaShort}
            </a>
          </span>
          <button
            type="button"
            className="lp-menu-btn"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      <div
        id={menuId}
        className={`lp-menu${open ? " is-open" : ""}`}
        hidden={!open}
      >
        <nav className="lp-menu__nav" aria-label="Mobile">
          <a href="#how" onClick={closeMenu}>
            {copy.nav.how}
          </a>
          <a href="#pricing" onClick={closeMenu}>
            {copy.nav.pricing}
          </a>
          <a href="#faq" onClick={closeMenu}>
            {copy.nav.faq}
          </a>
          <a
            href={copy.nav.langHref}
            hrefLang={locale === "en" ? "uk" : "en"}
            onClick={closeMenu}
          >
            {copy.nav.langSwitch}
          </a>
          <a href={appHref} data-cta="signin" onClick={closeMenu}>
            {copy.nav.signIn}
          </a>
        </nav>
      </div>
    </header>
  );
}
