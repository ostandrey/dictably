import type { Locale } from "@/lib/site";
import { localePath } from "@/lib/site";

type Props = {
  locale: Locale;
  label: string;
  className?: string;
  variant?: "primary" | "secondary" | "text";
};

/** Landing CTA → app sign-in (`/app/` or `/uk/app/`). */
export function AppCtaLink({
  locale,
  label,
  className = "",
  variant = "primary",
}: Props) {
  const base =
    variant === "primary"
      ? "btn-primary"
      : variant === "secondary"
        ? "btn-secondary"
        : "btn-text";

  return (
    <a
      href={localePath(locale, "/app")}
      className={`${base} ${className}`.trim()}
      data-cta="app"
    >
      {label}
    </a>
  );
}
