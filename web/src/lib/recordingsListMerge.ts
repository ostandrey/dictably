import type { MediaItem } from "@/lib/api";

/** True if `a` is strictly older than `b` in list order (created_at DESC, id DESC). */
export function isOlderThan(a: MediaItem, b: MediaItem): boolean {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at;
  return a.id < b.id;
}

/**
 * Merge a fresh first page into an already-loaded list (stale-while-revalidate).
 * Keep prior rows older than the last fresh row; drop rows missing from fresh that
 * are newer than that boundary (deleted). If API has no next_cursor, drop all older.
 */
export function mergeFirstPage(
  prev: MediaItem[],
  fresh: MediaItem[],
  nextCursor: string | null,
): MediaItem[] {
  if (!nextCursor) return fresh;
  if (!fresh.length) return fresh;
  const freshIds = new Set(fresh.map((m) => m.id));
  const boundary = fresh[fresh.length - 1]!;
  const older = prev.filter(
    (m) => !freshIds.has(m.id) && isOlderThan(m, boundary),
  );
  return [...fresh, ...older];
}
