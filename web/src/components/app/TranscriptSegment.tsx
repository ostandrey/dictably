"use client";

import { memo, type CSSProperties, type ReactNode } from "react";
import type { Speaker } from "@/lib/api";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function speakerName(speakers: Speaker[], label: string | null | undefined): string {
  if (!label) return "Speaker";
  const sp = speakers.find((s) => s.label === label);
  return sp?.display_name?.trim() || sp?.label || label;
}

function speakerTone(speakers: Speaker[], label: string | null | undefined): number {
  const sp = speakers.find((s) => s.label === label);
  return ((sp?.color_idx ?? 0) % 6) + 1;
}

export type TranscriptSegmentProps = {
  segId: string;
  startMs: number;
  speakerId: string | null | undefined;
  index: number;
  rowStart: number;
  active: boolean;
  isMatch: boolean;
  isCurrentMatch: boolean;
  isEvidence: boolean;
  menuOpen: boolean;
  speakers: Speaker[];
  changeSpeakerLabel: string;
  newSpeakerLabel: string;
  textNode: ReactNode;
  onMeasure: (el: Element | null) => void;
  onToggleMenu: (segId: string) => void;
  onSeek: (startMs: number) => void;
  onChangeSpeaker: (segId: string, speakerId: string) => void;
  onSplitSpeaker: (segId: string) => void;
};

/** Memoized turn row — keeps 2500-seg virtualized scroll off the longtask cliff (T-041 B5). */
export const TranscriptSegment = memo(function TranscriptSegment({
  segId,
  startMs,
  speakerId,
  index,
  rowStart,
  active,
  isMatch,
  isCurrentMatch,
  isEvidence,
  menuOpen,
  speakers,
  changeSpeakerLabel,
  newSpeakerLabel,
  textNode,
  onMeasure,
  onToggleMenu,
  onSeek,
  onChangeSpeaker,
  onSplitSpeaker,
}: TranscriptSegmentProps) {
  const style: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    transform: `translateY(${rowStart}px)`,
  };

  return (
    <div
      className={`dy-turn${active ? " is-playing" : ""}${isMatch ? " is-match" : ""}${isCurrentMatch ? " is-match-current" : ""}${isEvidence ? " is-evidence" : ""}`}
      data-recording="segment"
      data-seg-id={segId}
      data-start-ms={startMs}
      data-index={index}
      style={style}
      ref={onMeasure}
    >
      <span className="dy-speaker rec-seg-speaker">
        <span
          className={`dy-speaker__dot sp-${speakerTone(speakers, speakerId)}`}
          aria-hidden
        />
        <button
          type="button"
          className="btn-text"
          data-recording="seg-speaker"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu(segId);
          }}
        >
          {speakerName(speakers, speakerId)}
        </button>
        {menuOpen ? (
          <span
            className="rec-seg-menu"
            role="menu"
            data-recording="seg-speaker-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="rec-seg-menu__label">{changeSpeakerLabel}</span>
            {speakers.map((sp) => (
              <button
                key={sp.id}
                type="button"
                role="menuitem"
                className="rec-seg-menu__item"
                onClick={() => onChangeSpeaker(segId, sp.id)}
              >
                {sp.display_name || sp.label}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="rec-seg-menu__item"
              data-recording="seg-split"
              onClick={() => onSplitSpeaker(segId)}
            >
              {newSpeakerLabel}
            </button>
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className={`dy-timecode${active ? " is-active" : ""}`}
        data-recording="seg-seek"
        aria-label={formatClock(startMs / 1000)}
        onClick={() => onSeek(startMs)}
      >
        <svg className="dy-icon" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 2.5v7l6-3.5z" />
        </svg>
        <span className="dy-time">{formatClock(startMs / 1000)}</span>
      </button>
      <button
        type="button"
        className="dy-turn__text"
        data-recording="seg-text"
        onClick={() => onSeek(startMs)}
      >
        {textNode}
      </button>
    </div>
  );
});
