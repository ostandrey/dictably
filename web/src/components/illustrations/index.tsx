/** Illustrations v2 — sound becomes a page. Tokens only. ≤3 KB each. T-043. */

import type { CSSProperties, ReactNode } from "react";

type IllProps = {
  className?: string;
  title?: string;
  /** Replay entrance by remounting (sign-in / empty). */
  motionKey?: string | number;
};

function Frame({
  className,
  title,
  children,
  viewBox = "0 0 240 120",
  width = 240,
  height = 120,
}: IllProps & {
  children: ReactNode;
  viewBox?: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={viewBox}
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

function riseStyle(i: number): CSSProperties {
  return { ["--i" as string]: i };
}

/** Empty recordings — wave becoming a minutes page (variant A). One entrance. */
export function IllEmptyRecordings(props: IllProps) {
  return (
    <Frame {...props} key={props.motionKey ?? "empty"}>
      <g className="ill-v2" strokeWidth="5" strokeLinecap="round">
        <g stroke="var(--speaker-1)">
          <path className="ill-rise" style={riseStyle(0)} d="M12 52v16" />
          <path className="ill-rise" style={riseStyle(1)} d="M22 42v36" />
          <path className="ill-rise" style={riseStyle(2)} d="M32 50v20" />
          <path className="ill-rise" style={riseStyle(3)} d="M42 36v48" />
        </g>
        <g stroke="var(--speaker-2)">
          <path className="ill-rise" style={riseStyle(4)} d="M56 46v28" />
          <path className="ill-rise" style={riseStyle(5)} d="M66 32v56" />
          <path className="ill-rise" style={riseStyle(6)} d="M76 48v24" />
        </g>
        <g stroke="var(--speaker-1)">
          <path className="ill-rise" style={riseStyle(7)} d="M90 44v32" />
          <path className="ill-rise" style={riseStyle(8)} d="M100 54v12" />
        </g>
        <g stroke="var(--speaker-3)">
          <path className="ill-rise" style={riseStyle(9)} d="M114 50v20" opacity=".8" />
          <path className="ill-rise" style={riseStyle(10)} d="M124 55v10" opacity=".45" />
        </g>
      </g>
      <g className="ill-pop" style={riseStyle(9)}>
        <rect
          x="142"
          y="12"
          width="84"
          height="96"
          rx="8"
          fill="var(--surface-raised)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path d="M156 32h44" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <rect x="152" y="46" width="64" height="16" rx="4" fill="var(--evidence)" />
        <path
          d="M158 54h40"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".7"
        />
        <path
          d="M156 74h56M156 88h36"
          stroke="var(--ink-subtle)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".45"
        />
      </g>
    </Frame>
  );
}

/** Sign-in hero 400×220 — variant B: minutes line pinned to its moment. */
export function IllSignIn(props: IllProps) {
  return (
    <Frame
      {...props}
      key={props.motionKey ?? "signin"}
      viewBox="0 0 400 220"
      width={400}
      height={220}
    >
      <g className="ill-pop" style={riseStyle(6)}>
        <rect
          x="96"
          y="8"
          width="296"
          height="96"
          rx="12"
          fill="var(--surface-raised)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <rect
          x="114"
          y="28"
          width="18"
          height="18"
          rx="5"
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <path
          d="M118 37l4 4 7-8"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="142" y="24" width="232" height="28" rx="6" fill="var(--evidence)" />
        <path
          d="M152 38h150"
          stroke="var(--ink)"
          strokeWidth="4.5"
          strokeLinecap="round"
          opacity=".8"
        />
        <path
          d="M114 74h190M114 88h120"
          stroke="var(--ink-subtle)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity=".45"
        />
      </g>
      <g stroke="var(--line)" strokeWidth="2" strokeLinecap="round">
        <path d="M8 138H392M8 170H392M8 202H392" />
      </g>
      <g className="ill-v2">
        <rect
          className="ill-draw"
          style={riseStyle(0)}
          x="8"
          y="131"
          width="92"
          height="14"
          rx="7"
          fill="var(--speaker-1)"
        />
        <rect
          className="ill-draw"
          style={riseStyle(2)}
          x="196"
          y="131"
          width="58"
          height="14"
          rx="7"
          fill="var(--speaker-1)"
        />
        <rect
          className="ill-draw"
          style={riseStyle(4)}
          x="330"
          y="131"
          width="62"
          height="14"
          rx="7"
          fill="var(--speaker-1)"
        />
        <rect
          className="ill-draw"
          style={riseStyle(1)}
          x="108"
          y="163"
          width="82"
          height="14"
          rx="7"
          fill="var(--speaker-2)"
        />
        <rect
          className="ill-draw"
          style={riseStyle(3)}
          x="262"
          y="163"
          width="60"
          height="14"
          rx="7"
          fill="var(--speaker-2)"
        />
        <rect
          className="ill-draw"
          style={riseStyle(2)}
          x="44"
          y="195"
          width="48"
          height="14"
          rx="7"
          fill="var(--speaker-3)"
        />
        <rect
          className="ill-draw"
          style={riseStyle(4)}
          x="196"
          y="195"
          width="30"
          height="14"
          rx="7"
          fill="var(--speaker-3)"
        />
      </g>
      <g className="ill-pop" style={riseStyle(8)}>
        <path d="M292 104V163" stroke="var(--accent)" strokeWidth="2.5" />
        <circle
          cx="292"
          cy="170"
          r="11"
          fill="var(--evidence)"
          stroke="var(--accent)"
          strokeWidth="2.5"
        />
        <circle cx="292" cy="170" r="3.5" fill="var(--accent)" />
      </g>
    </Frame>
  );
}

/** People — each speaker's voice ending in what they promised. */
export function IllPeople(props: IllProps) {
  return (
    <Frame {...props}>
      <circle cx="30" cy="24" r="14" fill="var(--speaker-1)" />
      <circle cx="30" cy="60" r="14" fill="var(--speaker-2)" />
      <circle cx="30" cy="96" r="14" fill="var(--speaker-3)" />
      <g strokeWidth="4" strokeLinecap="round">
        <path
          stroke="var(--speaker-1)"
          d="M58 18v12M67 13v22M76 19v10M85 15v18M94 20v8M103 16v16M112 21v6"
        />
        <path stroke="var(--speaker-2)" d="M58 55v10M67 51v18M76 54v12M85 49v22" />
        <path
          stroke="var(--speaker-3)"
          d="M58 90v12M67 86v20M76 91v10M85 88v16M94 92v8M103 87v18"
        />
      </g>
      <g fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1.5">
        <rect x="186" y="14" width="20" height="20" rx="5" />
        <rect x="186" y="50" width="20" height="20" rx="5" />
        <rect x="186" y="86" width="20" height="20" rx="5" />
      </g>
      <path
        d="M191 24l4 4 7-8"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M191 96l4 4 7-8"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M128 24h44M108 60h64M124 96h48"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 6"
      />
    </Frame>
  );
}

/** Processing — continuous scan; static under prefers-reduced-motion. */
export function IllProcessing(props: IllProps) {
  return (
    <Frame {...props}>
      <g strokeWidth="6" strokeLinecap="round">
        <path stroke="var(--speaker-1)" d="M16 50v20M30 38v44M44 46v28" />
        <path stroke="var(--speaker-2)" d="M58 30v60M72 44v32M86 52v16" />
        <path stroke="var(--speaker-1)" d="M100 40v40M114 48v24" />
        <path
          stroke="var(--line)"
          d="M128 34v52M142 46v28M156 54v12M170 40v40M184 50v20M198 36v48M212 48v24M226 54v12"
        />
      </g>
      <g className="ill-scan">
        <path d="M121 18v84" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="121" cy="18" r="4" fill="var(--accent)" />
      </g>
    </Frame>
  );
}

/** Failed — wave breaks; calm mark in the gap. */
export function IllFailed(props: IllProps) {
  return (
    <Frame {...props}>
      <g strokeWidth="6" strokeLinecap="round" stroke="var(--ink-subtle)" opacity=".4">
        <path d="M24 50v20M38 38v44M52 46v28M66 32v56M80 48v24" />
        <path d="M160 44v32M174 34v52M188 50v20M202 42v36M216 52v16" />
      </g>
      <circle
        cx="120"
        cy="60"
        r="22"
        fill="var(--danger-soft)"
        stroke="var(--danger)"
        strokeWidth="2"
      />
      <path d="M120 49v14" stroke="var(--danger)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="120" cy="71" r="2.4" fill="var(--danger)" />
    </Frame>
  );
}

/** 404 — silence; "?" as path (not text). */
export function IllNotFound(props: IllProps) {
  return (
    <Frame {...props}>
      <g strokeWidth="6" strokeLinecap="round">
        <path stroke="var(--speaker-1)" d="M16 42v36" />
        <path stroke="var(--speaker-1)" opacity=".7" d="M30 48v24" />
        <path stroke="var(--speaker-1)" opacity=".5" d="M44 52v16" />
        <path stroke="var(--speaker-1)" opacity=".3" d="M58 56v8" />
      </g>
      <path d="M72 60h96" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
      {/* Contour "?" — bowl + stem + separate dot */}
      <path
        d="M186 48c0-10 7.5-16.5 16.5-16.5S219 38 219 48c0 7-3.5 10.5-9 14.5L204 68v8"
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="204" cy="88" r="3.5" fill="var(--accent)" />
    </Frame>
  );
}

/** Deleted / empty bin — page outline left. */
export function IllDeleted(props: IllProps) {
  return (
    <Frame {...props}>
      <rect
        x="78"
        y="12"
        width="84"
        height="96"
        rx="8"
        fill="none"
        stroke="var(--line)"
        strokeWidth="2"
        strokeDasharray="5 6"
      />
      <path
        d="M92 40h44M92 58h56M92 76h32"
        stroke="var(--line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle
        cx="162"
        cy="94"
        r="16"
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
      <path
        d="M155 94l5 5 9-10"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}
