import type { ReactNode } from "react";
import { AppChrome } from "@/components/app/AppChrome";
import { AppProviders } from "@/components/app/AppProviders";
import { site } from "@/lib/site";
import "@/styles/app-only.css";

export default function UkAppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AppChrome locale="uk" brandName={site.name}>
        {children}
      </AppChrome>
    </AppProviders>
  );
}
