import type { Locale } from "@/lib/site";
import { site } from "@/lib/site";

type Props = {
  locale: Locale;
  label: string;
  className?: string;
  variant?: "primary" | "secondary" | "text";
};

export function TallyButton({
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
    <button
      type="button"
      className={`${base} ${className}`.trim()}
      data-cta="tally"
      data-locale={locale}
      data-form-id={site.tally[locale]}
      data-contact={site.contactEmail}
    >
      {label}
    </button>
  );
}
