"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
  dismissible = true,
  size = "default",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  /** When false, Escape / backdrop cancel are ignored (consent gate). */
  dismissible?: boolean;
  /** `lg` for longer forms (follow-up email). */
  size?: "default" | "lg";
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Hide the rest of the app from AT / interaction while modal is open (T-033 B1).
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const roots = document.querySelectorAll<HTMLElement>("[data-app-inert-root]");
    for (const node of roots) node.inert = true;
    return () => {
      for (const node of roots) node.inert = false;
    };
  }, [open]);

  // Focus primary action (not the first link in body — avoids Terms outline) once shown.
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const primary =
      el.querySelector<HTMLElement>(".dy-dialog__actions .dy-btn--primary") ??
      el.querySelector<HTMLElement>(".dy-dialog__actions button");
    (primary ?? el).focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={ref}
      className={size === "lg" ? "dy-dialog dy-dialog--lg" : "dy-dialog"}
      data-dialog="open"
      aria-labelledby={titleId}
      onClose={() => {
        if (dismissible) onClose();
      }}
      onCancel={(e) => {
        if (!dismissible) {
          e.preventDefault();
          return;
        }
        onClose();
      }}
    >
      <h2 id={titleId} className="dy-dialog__title">
        {title}
      </h2>
      <div className="dy-dialog__body">{children}</div>
      {actions ? <div className="dy-dialog__actions">{actions}</div> : null}
    </dialog>,
    document.body,
  );
}
