import type { ReactNode } from "react";
import { AppProviders } from "@/components/app/AppProviders";
import { AdminChrome } from "@/components/app/AdminChrome";
import "@/styles/app-only.css";

export default function EnAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AdminChrome locale="en">{children}</AdminChrome>
    </AppProviders>
  );
}
