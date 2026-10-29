import type { ReactNode } from "react";
import { AppProviders } from "@/components/app/AppProviders";
import { AdminChrome } from "@/components/app/AdminChrome";
import "@/styles/app-only.css";

export default function UkAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AdminChrome locale="uk">{children}</AdminChrome>
    </AppProviders>
  );
}
