/** Brand SVG set — speaker lanes / wave / marked document. Tokens only. ≤3 KB each. */

import type { ReactNode } from "react";

type IllProps = { className?: string; title?: string };

function Frame({
  className,
  title,
  children,
}: IllProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Empty recordings — three speaker lanes + quiet wave. */
export function IllEmptyRecordings(props: IllProps) {
  return (
    <Frame {...props}>
      <rect x="18" y="28" width="124" height="64" rx="10" fill="var(--surface)" stroke="var(--line)" />
      <rect x="30" y="42" width="72" height="6" rx="3" fill="var(--speaker-1)" opacity="0.9" />
      <rect x="42" y="56" width="56" height="6" rx="3" fill="var(--speaker-2)" opacity="0.85" />
      <rect x="34" y="70" width="64" height="6" rx="3" fill="var(--speaker-3)" opacity="0.8" />
      <path
        d="M108 48c4 2 8-2 12 0s8 6 12 4"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </Frame>
  );
}

/** People — lanes converging into markers (promises). */
export function IllPeople(props: IllProps) {
  return (
    <Frame {...props}>
      <rect x="20" y="24" width="120" height="72" rx="10" fill="var(--surface)" stroke="var(--line)" />
      <rect x="34" y="40" width="40" height="5" rx="2.5" fill="var(--speaker-1)" />
      <rect x="34" y="54" width="52" height="5" rx="2.5" fill="var(--speaker-2)" />
      <rect x="34" y="68" width="36" height="5" rx="2.5" fill="var(--speaker-4)" />
      <circle cx="112" cy="42" r="7" fill="var(--accent-soft)" stroke="var(--accent)" />
      <circle cx="124" cy="58" r="7" fill="var(--evidence)" stroke="var(--speaker-2)" />
      <circle cx="112" cy="74" r="7" fill="var(--accent-soft)" stroke="var(--speaker-3)" />
      <path d="M78 42h20M90 56h20M74 70h24" stroke="var(--line-strong)" strokeWidth="1.5" strokeLinecap="round" />
    </Frame>
  );
}

/** Settings — document with accent marker. */
export function IllSettings(props: IllProps) {
  return (
    <Frame {...props}>
      <rect x="44" y="18" width="72" height="84" rx="8" fill="var(--surface-raised)" stroke="var(--line)" />
      <rect x="56" y="36" width="40" height="5" rx="2.5" fill="var(--ink-subtle)" opacity="0.45" />
      <rect x="56" y="48" width="48" height="5" rx="2.5" fill="var(--ink-subtle)" opacity="0.35" />
      <rect x="56" y="60" width="36" height="5" rx="2.5" fill="var(--ink-subtle)" opacity="0.3" />
      <rect x="54" y="74" width="28" height="14" rx="3" fill="var(--evidence)" />
      <path d="M58 81h20" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </Frame>
  );
}

/** Processing — animated wave (CSS class); static when reduced-motion. */
export function IllProcessing(props: IllProps) {
  return (
    <Frame {...props}>
      <rect x="18" y="36" width="124" height="48" rx="10" fill="var(--surface)" stroke="var(--line)" />
      <g className="ill-wave">
        <rect className="ill-wave__bar" x="36" y="52" width="5" height="16" rx="2.5" fill="var(--speaker-1)" />
        <rect className="ill-wave__bar" x="48" y="46" width="5" height="28" rx="2.5" fill="var(--speaker-2)" />
        <rect className="ill-wave__bar" x="60" y="50" width="5" height="20" rx="2.5" fill="var(--accent)" />
        <rect className="ill-wave__bar" x="72" y="44" width="5" height="32" rx="2.5" fill="var(--speaker-3)" />
        <rect className="ill-wave__bar" x="84" y="48" width="5" height="24" rx="2.5" fill="var(--speaker-4)" />
        <rect className="ill-wave__bar" x="96" y="52" width="5" height="16" rx="2.5" fill="var(--speaker-5)" />
        <rect className="ill-wave__bar" x="108" y="50" width="5" height="20" rx="2.5" fill="var(--speaker-6)" />
        <rect className="ill-wave__bar" x="120" y="54" width="5" height="12" rx="2.5" fill="var(--accent)" />
      </g>
    </Frame>
  );
}

/** Failed processing — broken lane + danger mark. */
export function IllFailed(props: IllProps) {
  return (
    <Frame {...props}>
      <rect x="18" y="28" width="124" height="64" rx="10" fill="var(--danger-soft)" stroke="var(--line)" />
      <rect x="32" y="48" width="60" height="6" rx="3" fill="var(--speaker-1)" opacity="0.5" />
      <rect x="32" y="64" width="40" height="6" rx="3" fill="var(--speaker-2)" opacity="0.4" />
      <circle cx="118" cy="56" r="14" fill="var(--surface-raised)" stroke="var(--danger)" strokeWidth="2" />
      <path d="M118 48v10M118 64v2" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  );
}

/** 404 — missing document silhouette. */
export function IllNotFound(props: IllProps) {
  return (
    <Frame {...props}>
      <rect x="40" y="16" width="80" height="88" rx="8" fill="var(--surface)" stroke="var(--line)" strokeDasharray="4 3" />
      <path
        d="M58 52h44M66 66h28"
        stroke="var(--ink-subtle)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="104" cy="88" r="18" fill="var(--accent-soft)" stroke="var(--accent)" />
      <path d="M98 88h12M104 82v12" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  );
}

/** Deleted / empty bin — open tray with soft fade. */
export function IllDeleted(props: IllProps) {
  return (
    <Frame {...props}>
      <path
        d="M48 40h64l-6 44a8 8 0 0 1-8 7H62a8 8 0 0 1-8-7L48 40z"
        fill="var(--surface)"
        stroke="var(--line)"
      />
      <path d="M42 40h76" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
      <rect x="70" y="28" width="20" height="10" rx="2" fill="var(--accent-soft)" stroke="var(--accent)" />
      <path d="M64 58h32M68 70h24" stroke="var(--ink-subtle)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
    </Frame>
  );
}
