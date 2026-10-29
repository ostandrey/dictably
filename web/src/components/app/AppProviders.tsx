"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/app/AuthProvider";
import { ConsentGate } from "@/components/app/ConsentGate";
import { OnboardingGate } from "@/components/app/OnboardingGate";
import { ToastProvider } from "@/components/app/ToastProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConsentGate />
        <OnboardingGate />
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
