"use client";

import { useAuth } from "@/components/app/AuthProvider";
import { AdminPanel, type AdminCopy } from "@/components/app/AdminPanel";

type Props = {
  locale: "en" | "uk";
  appHref: string;
  loadingLabel: string;
  notFoundTitle: string;
  notFoundBody: string;
  openApp: string;
  adminCopy: AdminCopy;
};

/** Admin body after RequireAuth (T-037). Non-admins get a 404-style gate. */
export function AdminPageClient({
  appHref,
  loadingLabel,
  notFoundTitle,
  notFoundBody,
  openApp,
  adminCopy,
}: Props) {
  const { status, user } = useAuth();

  if (status === "loading" || !user) {
    return (
      <p className="dy-muted" data-admin="boot">
        {loadingLabel}
      </p>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="admin-gate" data-admin="forbidden">
        <h2 className="dy-type-title admin-gate__title">{notFoundTitle}</h2>
        <p className="app-shell__body">{notFoundBody}</p>
        <a className="dy-btn dy-btn--secondary" href={appHref}>
          {openApp}
        </a>
      </div>
    );
  }

  return <AdminPanel copy={adminCopy} />;
}
