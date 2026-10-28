import type { HTMLAttributes, ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: string;
  children: ReactNode;
};

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
      {title ? <strong className="dy-alert__title">{title}</strong> : null}
      <div className="dy-alert__body">{children}</div>
    </div>
  );
}
