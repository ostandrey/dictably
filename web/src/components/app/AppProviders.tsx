"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/app/AuthProvider";
import { ToastProvider } from "@/components/app/ToastProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
