import { isPreview } from "@/lib/site";

/** Thin top strip in SITE_MODE=preview (T-023a). Server component. */
export function PreviewBanner({ label }: { label: string }) {
  if (!isPreview) return null;
  return (
    <div className="preview-banner" role="status" data-site-mode="preview">
      {label}
    </div>
  );
}
