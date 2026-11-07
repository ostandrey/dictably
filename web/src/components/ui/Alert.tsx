import type { HTMLAttributes, ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: string;
  children: ReactNode;
};

function ToneIcon({ tone }: { tone: Tone }) {
  // Circle + mark — fills the 20px grid column so title/body stay in 1fr.
  if (tone === "success") {
    return (
      <svg className="dy-icon dy-icon--20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.2 8.8 12.5 13.5 7.5" />
      </svg>
    );
  }
  if (tone === "warning" || tone === "danger") {
    return (
      <svg className="dy-icon dy-icon--20" viewBox="0 0 20 20" aria-hidden>
        <path d="M10 3.2 17.5 16.5H2.5L10 3.2Z" />
        <path d="M10 8v4.2" />
        <circle cx="10" cy="14.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg className="dy-icon dy-icon--20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Alert({
  tone = "info",
  title,
  className = "",
  children,
  ...rest
}: AlertProps) {
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";
  return (
    <div
      className={`dy-alert dy-alert--${tone} ${className}`.trim()}
      role={role}
      {...rest}
    >
      <ToneIcon tone={tone} />
      {title ? <strong className="dy-alert__title">{title}</strong> : null}
      <div className="dy-alert__body">{children}</div>
    </div>
  );
}
