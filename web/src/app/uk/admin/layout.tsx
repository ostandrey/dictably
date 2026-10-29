import type { ReactNode } from "react";
import { AppProviders } from "@/components/app/AppProviders";
import "@/styles/app-only.css";

export default function UkAdminLayout({ children }: { children: ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
