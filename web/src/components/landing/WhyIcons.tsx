import type { ReactNode } from "react";

/** Lucide outline icons (MIT) — 18px, stroke 1.6 — see THIRD_PARTY_NOTICES.md */

type Name = "proof" | "sides" | "langs" | "tracks" | "nobot" | "privacy";

const PATHS: Record<Name, ReactNode> = {
  proof: (
    <>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  sides: <path d="M7 7h10M7 12h6M7 17h8" />,
  langs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
    </>
  ),
  /* Speaker-track motif (T-042 / T-036): parallel lanes */
  tracks: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <circle cx="6" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  nobot: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M9 10h.01M15 10h.01M9 14h6" />
      <path d="M4 4l16 16" />
    </>
  ),
  privacy: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
};

export function WhyIcons({ name }: { name: Name }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
