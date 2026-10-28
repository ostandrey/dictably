import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
};

export function Badge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={`dy-badge dy-badge--${tone} ${className}`.trim()} {...rest}>
      {dot ? <span className="dy-badge__dot" aria-hidden /> : null}
      {children}
    </span>
  );
}
