"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="dy-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
    >
      <h2 id={titleId} className="dy-dialog__title">
        {title}
      </h2>
      <div className="dy-dialog__body">{children}</div>
      {actions ? <div className="dy-dialog__actions">{actions}</div> : null}
    </dialog>
  );
}
