import type { HTMLAttributes, ReactNode } from "react";
import { Badge } from "./Badge";

export type RecordingStatus =
  | "ready"
  | "processing"
  | "failed"
  | "uploading"
  | "queued";

const tone: Record<RecordingStatus, "success" | "accent" | "danger" | "neutral"> = {
  ready: "success",
  processing: "accent",
  failed: "danger",
  uploading: "neutral",
  queued: "neutral",
};

export function RecordingRow({
  title,
  meta,
  status,
  statusLabel,
  statusHint,
  speakers = 0,
  action,
  href,
  muted = false,
  ...rest
}: {
  title: string;
  meta: string;
  status: RecordingStatus;
  statusLabel: string;
  /** Optional what/next line under the badge (T-041). */
  statusHint?: string | null;
  speakers?: number;
  action?: ReactNode;
  href?: string;
  /** N2: dim while search is refreshing. */
  muted?: boolean;
} & HTMLAttributes<HTMLElement>) {
  const dots = Array.from({ length: Math.min(6, Math.max(0, speakers)) }, (_, i) => (
    <span key={i} className={`sp-${(i % 6) + 1}`} />
  ));

  return (
    <div
      className={`dy-rec${muted ? " is-muted" : ""}`}
      data-rec-layout="row"
      {...rest}
    >
      <div className="dy-rec__main">
        {href ? (
          <a className="dy-rec__title" href={href}>
            {title}
          </a>
        ) : (
          <p className="dy-rec__title">{title}</p>
        )}
        {meta ? <p className="dy-rec__meta">{meta}</p> : null}
      </div>
      <div className="dy-rec__speakers" aria-hidden>
        {dots}
      </div>
      <div className="dy-rec__status">
        <Badge tone={tone[status]} dot>
          {statusLabel}
        </Badge>
        {statusHint ? (
          <span className="dy-rec__status-hint">{statusHint}</span>
        ) : null}
      </div>
      {action ?? <span className="dy-rec__action-spacer" />}
    </div>
  );
}
