import type { MediaItem } from "@/lib/api";

const READY_LIKE = new Set(["ready", "analyzing"]);

/** UI locale for Intl (T-041 P1). */
export function uiDateLocale(uiLocale: string): string {
  return uiLocale === "uk" ? "uk-UA" : "en-GB";
}

export function formatMeetingDay(
  isoDate: string | null | undefined,
  uiLocale: string,
): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(uiDateLocale(uiLocale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatCreatedDay(
  iso: string | null | undefined,
  uiLocale: string,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(uiDateLocale(uiLocale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Display title: human title → provisional “Meeting · date” before ready → filename.
 */
export function mediaDisplayTitle(
  item: Pick<MediaItem, "title" | "filename" | "status" | "meeting_date" | "created_at">,
  uiLocale: string,
  provisionalPrefix: string,
): string {
  const titled = (item.title ?? "").trim();
  if (titled) return titled;
  if (!READY_LIKE.has(item.status)) {
    const when =
      formatMeetingDay(item.meeting_date, uiLocale) ||
      formatCreatedDay(item.created_at, uiLocale);
    return when ? `${provisionalPrefix} · ${when}` : provisionalPrefix;
  }
  return item.filename;
}

/** Join meta parts without em-dash placeholders (T-041 P1). */
export function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
}

export function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
