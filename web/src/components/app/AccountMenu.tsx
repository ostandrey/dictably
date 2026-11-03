"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/api";

function initials(user: User): string {
  const base = (user.name || user.email || "?").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

/** T-045 D7: avatar + name one row; email + Sign out in a popover. */
export function AccountMenu({
  user,
  logoutLabel,
  onLogout,
}: {
  user: User;
  logoutLabel: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const name = user.name?.trim() || user.email.split("@")[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="app-sidebar__account" data-auth="account" ref={rootRef}>
      <button
        type="button"
        className="app-sidebar__account-btn"
        data-auth="account-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-sidebar__avatar" aria-hidden>
          {initials(user)}
        </span>
        <span className="app-sidebar__name">{name}</span>
      </button>
      {open ? (
        <div className="app-sidebar__account-pop" role="menu" data-auth="account-menu">
          <p className="app-sidebar__email" data-auth="email">
            {user.email}
          </p>
          <button
            type="button"
            className="btn-text app-sidebar__logout"
            role="menuitem"
            data-auth="logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            {logoutLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
