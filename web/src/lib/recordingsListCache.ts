/** Recordings list cache for back-navigation (T-039). sessionStorage survives static-export page loads. */

import type { MediaItem } from "@/lib/api";

const STORAGE_KEY = "dictably.recordingsList.v2";
const CHANGE_EVENT = "dictably-recordings-cache";

export type RecordingsListCache = {
  userId: string;
  items: MediaItem[];
  nextCursor: string | null;
  query: string;
  scrollY: number;
};

let memory: RecordingsListCache | null = null;

function readStorage(): RecordingsListCache | null {
  if (typeof window === "undefined") return null;
  try {
    // Drop legacy unscoped cache (privacy: B4).
    sessionStorage.removeItem("dictably.recordingsList.v1");
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecordingsListCache;
    if (!parsed.userId || !Array.isArray(parsed.items)) return null;
    return {
      userId: parsed.userId,
      items: parsed.items,
      nextCursor: parsed.nextCursor ?? null,
      query: typeof parsed.query === "string" ? parsed.query : "",
      scrollY: typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
    };
  } catch {
    return null;
  }
}

function writeStorage(next: RecordingsListCache | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!next) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveRecordingsListCache(next: RecordingsListCache): void {
  memory = {
    userId: next.userId,
    items: next.items,
    nextCursor: next.nextCursor,
    query: next.query,
    scrollY: next.scrollY,
  };
  writeStorage(memory);
  notify();
}

export function takeRecordingsListCache(): RecordingsListCache | null {
  return peekRecordingsListCache();
}

export function peekRecordingsListCache(): RecordingsListCache | null {
  if (memory) return memory;
  memory = readStorage();
  return memory;
}

/** Cache for this user only; clears a foreign user's leftover (B4). */
export function peekRecordingsListCacheForUser(
  userId: string | null | undefined,
): RecordingsListCache | null {
  if (!userId) return null;
  const cur = peekRecordingsListCache();
  if (!cur) return null;
  if (cur.userId !== userId) {
    clearRecordingsListCache();
    return null;
  }
  return cur;
}

export function clearRecordingsListCache(): void {
  memory = null;
  writeStorage(null);
  notify();
}

/** useSyncExternalStore subscribe — fires after save/clear. */
export function subscribeRecordingsListCache(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}
