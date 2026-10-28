import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const sizeClass =
    size === "sm"
      ? "dy-btn--sm"
      : size === "lg"
        ? "dy-btn--lg"
        : size === "icon"
          ? "dy-btn--icon"
          : "";
  const classes = [
    "dy-btn",
    `dy-btn--${variant}`,
    sizeClass,
    loading ? "is-disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="dy-spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}
