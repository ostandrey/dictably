"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

/** Mobile drawer from the bottom — focus trap, backdrop, data-sheet (T-041). */
export function BottomSheet({
  open,
  title,
  children,
  actions,
  onClose,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const t = useTranslations("app");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const roots = document.querySelectorAll<HTMLElement>("[data-app-inert-root]");
    for (const node of roots) node.inert = true;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const node of roots) node.inert = false;
      document.body.style.overflow = prevOverflow;
      const restore = previouslyFocused.current;
      if (restore && typeof restore.focus === "function") {
        restore.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const primary =
      el.querySelector<HTMLElement>(".dy-sheet__actions .dy-btn--primary") ??
      el.querySelector<HTMLElement>(".dy-sheet__actions button") ??
      el.querySelector<HTMLElement>("button, [href], input, select, textarea");
    (primary ?? el).focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const closeLabel = t("sheetClose");

  return createPortal(
    <div className="dy-sheet" data-sheet="open" role="presentation">
      <button
        type="button"
        className="dy-sheet__backdrop"
        aria-label={closeLabel}
        data-sheet="backdrop"
        tabIndex={-1}
        onClick={() => {
          if (dismissible) onClose();
        }}
      />
      <div
        ref={panelRef}
        className="dy-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-sheet="panel"
        tabIndex={-1}
      >
        <div className="dy-sheet__grab" aria-hidden />
        <div className="dy-sheet__head">
          <h2 id={titleId} className="dy-sheet__title">
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              className="dy-sheet__close"
              aria-label={closeLabel}
              data-sheet="close"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="dy-sheet__body">{children}</div>
        {actions ? <div className="dy-sheet__actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
