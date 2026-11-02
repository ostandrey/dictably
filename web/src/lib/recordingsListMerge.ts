import type { MediaItem } from "@/lib/api";

/** True if `a` is strictly older than `b` in list order (created_at DESC, id DESC). */
export function isOlderThan(a: MediaItem, b: MediaItem): boolean {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at;
  return a.id < b.id;
}

/**
 * Merge a fresh first page into an already-loaded list (stale-while-revalidate).
 * Keep prior rows older than the last fresh row; drop mid-window rows missing from
 * fresh (deleted). Keep prior rows newer than the freshest API row only when they
 * were uploaded in this tab (`sessionIds`) — avoids ghost rows deleted elsewhere
 * (T-043 N9 + N2).
 */
export function mergeFirstPage(
  prev: MediaItem[],
  fresh: MediaItem[],
  nextCursor: string | null,
  sessionIds?: ReadonlySet<string>,
): MediaItem[] {
  if (!fresh.length) return nextCursor ? prev : fresh;
  const freshIds = new Set(fresh.map((m) => m.id));
  const newest = fresh[0]!;
  const newer = prev.filter(
    (m) =>
      !freshIds.has(m.id) &&
      isOlderThan(newest, m) &&
      (sessionIds == null || sessionIds.has(m.id)),
  );
  if (!nextCursor) return [...newer, ...fresh];
  const boundary = fresh[fresh.length - 1]!;
  const older = prev.filter(
    (m) => !freshIds.has(m.id) && isOlderThan(m, boundary),
  );
  return [...newer, ...fresh, ...older];
}
