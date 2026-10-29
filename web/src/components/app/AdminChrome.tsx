"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/components/app/RequireAuth";

export function AdminChrome({
  locale,
  children,
}: {
  locale: "en" | "uk";
  children: ReactNode;
}) {
  return (
    <div data-app-inert-root>
      <RequireAuth locale={locale}>{children}</RequireAuth>
    </div>
  );
}
