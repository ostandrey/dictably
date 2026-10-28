import type { ReactNode } from "react";
import { Badge } from "./Badge";

export type RecordingStatus = "ready" | "processing" | "failed" | "uploading";

const tone: Record<RecordingStatus, "success" | "accent" | "danger" | "neutral"> = {
  ready: "success",
  processing: "accent",
  failed: "danger",
  uploading: "neutral",
};

export function RecordingRow({
  title,
  meta,
  status,
  statusLabel,
  speakers = 0,
  action,
  href,
}: {
  title: string;
  meta: string;
  status: RecordingStatus;
  statusLabel: string;
  speakers?: number;
  action?: ReactNode;
  href?: string;
}) {
  const dots = Array.from({ length: Math.min(6, Math.max(0, speakers)) }, (_, i) => (
    <span key={i} className={`sp-${(i % 6) + 1}`} />
  ));

  const body = (
    <>
      <div>
        <p className="dy-rec__title">{title}</p>
        <p className="dy-rec__meta">{meta}</p>
      </div>
      <div className="dy-rec__speakers" aria-hidden>
        {dots}
      </div>
      <Badge tone={tone[status]} dot>
        {statusLabel}
      </Badge>
      {action}
    </>
  );

  if (href) {
    return (
      <a className="dy-rec" href={href}>
        {body}
      </a>
    );
  }
  return <div className="dy-rec">{body}</div>;
}
