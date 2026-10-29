"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode } from "react";
import { AppDropOverlay } from "@/components/app/AppDropOverlay";
import { AppShell } from "@/components/app/AppShell";
import { RequireAuth } from "@/components/app/RequireAuth";
import { localePath } from "@/i18n/locales";

type Locale = "en" | "uk";

function resolveNav(
  pathname: string,
): "recordings" | "people" | "settings" | "admin" {
  if (pathname.includes("/people")) return "people";
  if (pathname.includes("/settings")) return "settings";
  if (pathname.includes("/admin")) return "admin";
  return "recordings";
}

export function AppChrome({
  locale,
  brandName,
  children,
}: {
  locale: Locale;
  brandName: string;
  children: ReactNode;
}) {
  const t = useTranslations("app");
  const pathname = usePathname() || "";
  const nav = resolveNav(pathname);
  const prefix = locale === "uk" ? "/uk" : "";
  const recordingsHref = `${prefix}/app/`;
  const peopleHref = `${prefix}/app/people/`;
  const settingsHref = `${prefix}/app/settings/`;
  const adminHref = locale === "uk" ? "/uk/admin/" : "/admin/";

  return (
    <div data-app-inert-root>
      <RequireAuth locale={locale}>
        <AppShell
          backHref={localePath(locale)}
          backLabel={t("back")}
          recordingsHref={recordingsHref}
          settingsHref={settingsHref}
          peopleHref={peopleHref}
          adminHref={adminHref}
          logoutLabel={t("logout")}
          brandName={brandName}
          nav={nav}
          navRecordings={t("navRecordings")}
          navPeople={t("navPeople")}
          navSettings={t("navSettings")}
          navAdmin={t("navAdmin")}
          showAccountInMain={nav === "settings"}
        >
          {children}
        </AppShell>
        <AppDropOverlay
          dropLabel={t("uploadDrop")}
          recordingsHref={recordingsHref}
        />
      </RequireAuth>
    </div>
  );
}
