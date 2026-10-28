import type { HTMLAttributes, ReactNode } from "react";
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
  ...rest
}: {
  title: string;
  meta: string;
  status: RecordingStatus;
  statusLabel: string;
  speakers?: number;
  action?: ReactNode;
  href?: string;
} & HTMLAttributes<HTMLElement>) {
  const dots = Array.from({ length: Math.min(6, Math.max(0, speakers)) }, (_, i) => (
    <span key={i} className={`sp-${(i % 6) + 1}`} />
  ));

  return (
    <div className="dy-rec" {...rest}>
      <div>
        {href ? (
          <a className="dy-rec__title" href={href}>
            {title}
          </a>
        ) : (
          <p className="dy-rec__title">{title}</p>
        )}
        <p className="dy-rec__meta">{meta}</p>
      </div>
      <div className="dy-rec__speakers" aria-hidden>
        {dots}
      </div>
      <Badge tone={tone[status]} dot>
        {statusLabel}
      </Badge>
      {action ?? <span />}
    </div>
  );
}
