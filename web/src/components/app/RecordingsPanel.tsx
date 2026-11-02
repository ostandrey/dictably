"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useToast } from "@/components/app/ToastProvider";
import {
  IllDeleted,
  IllEmptyRecordings,
  IllProcessing,
} from "@/components/illustrations";
import { useLocale, useTranslations } from "next-intl";
import {
  ApiError,
  deleteMedia,
  listMedia,
  listMediaStatus,
  mediaAudioUrl,
  patchMedia,
  probeMediaUpload,
  uploadMedia,
  type MediaItem,
  type MediaProbe,
} from "@/lib/api";
import { useAuth } from "@/components/app/AuthProvider";
import { takeStashedFiles } from "@/lib/fileQueue";
import {
  clearRecordingsListCache,
  peekRecordingsListCache,
  saveRecordingsListCache,
  subscribeRecordingsListCache,
} from "@/lib/recordingsListCache";
import { mergeFirstPage } from "@/lib/recordingsListMerge";
import {
  formatDurationMs,
  formatMeetingDay,
  joinMeta,
  mediaDisplayTitle,
} from "@/lib/mediaDisplay";
import { ACCEPT, isAcceptedUpload, MAX_UPLOAD_BYTES } from "@/lib/uploadAccept";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Alert,
  BottomSheet,
  Button,
  Dialog,
  EmptyState,
  RecordingRow,
} from "@/components/ui";
import type { RecordingStatus } from "@/components/ui";

const PAGE_SIZE = 20;
const ACTIVE = new Set([
  "uploaded",
  "queued",
  "processing",
  "transcribing",
  "analyzing",
]);

export type RecordingsCopy = {
  title: string;
  hint: string;
  choose: string;
  drop: string;
  uploading: string;
  cancel: string;
  empty: string;
  searchEmpty: string;
  clearSearch: string;
  searchPlaceholder: string;
  showMore: string;
  allRecordings: string;
  uploadCta: string;
  tooLarge: string;
  badType: string;
  error: string;
  statusUploaded: string;
  statusQueued: string;
  statusQueuedHint: string;
  statusProcessing: string;
  statusReady: string;
  statusFailed: string;
  menuLabel: string;
  deleteLabel: string;
  deleteConfirmTitle: string;
  deleteConfirmBody: string;
  deleteConfirmAction: string;
  keepLabel: string;
  deleteBusyHint: string;
  emptyBody: string;
  uploadDetailsTitle?: string;
  uploadDetailsContinue?: string;
  uploadLanguageLabel?: string;
  uploadLanguageAuto?: string;
  uploadSpeakersLabel?: string;
  uploadSpeakersAuto?: string;
  uploadVocabLabel?: string;
  uploadVocabHint?: string;
  uploadTrackLabel?: string;
  uploadMeetingBundle?: string;
  uploadMeetingBundleHint?: string;
  uploadBundleTooLarge?: string;
  uploadTemplateLabel?: string;
  minutesTemplateDefault?: string;
  minutesTemplateOfficial?: string;
  provisionalMeeting?: string;
  renameLabel?: string;
  renameTitle?: string;
  renameSave?: string;
  downloadLabel?: string;
  statusUploadedHint?: string;
  statusUploadedStale?: string;
  statusQueuedNext?: string;
  statusProcessingHint?: string;
  statusReadyHint?: string;
  statusFailedHint?: string;
  refreshStatus?: string;
};

type Props = {
  copy: RecordingsCopy;
  recordingBaseHref: string;
  deletedToast: string;
};

function languageLabel(
  code: string | null | undefined,
  uiLocale: string,
): string | null {
  if (!code) return null;
  try {
    const dn = new Intl.DisplayNames(uiLocale === "uk" ? "uk-UA" : "en-GB", {
      type: "language",
    });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

function statusLabel(status: string, copy: RecordingsCopy): string {
  switch (status) {
    case "uploaded":
      return copy.statusUploaded;
    case "queued":
      return copy.statusQueued;
    case "processing":
    case "transcribing":
    case "analyzing":
    case "uploading":
      return copy.statusProcessing;
    case "ready":
      return copy.statusReady;
    case "failed":
      return copy.statusFailed;
    default:
      return status;
  }
}

function statusHintFor(
  item: MediaItem,
  copy: RecordingsCopy,
): string | null {
  switch (item.status) {
    case "uploaded": {
      const ageMs = Date.now() - new Date(item.created_at).getTime();
      if (ageMs > 2 * 60 * 1000) {
        return copy.statusUploadedStale ?? copy.statusUploadedHint ?? null;
      }
      return copy.statusUploadedHint ?? null;
    }
    case "queued":
      return copy.statusQueuedNext ?? copy.statusQueuedHint;
    case "processing":
    case "transcribing":
    case "analyzing":
    case "uploading":
      return copy.statusProcessingHint ?? null;
    case "ready":
      return null; // T-041 S8: ready hint clutters the list
    case "failed":
      return item.error?.trim() || copy.statusFailedHint || null;
    default:
      return null;
  }
}

function toRowStatus(status: string): RecordingStatus {
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  if (status === "uploading") return "uploading";
  if (status === "queued") return "queued";
  return "processing";
}

function isDeleteBusy(status: string): boolean {
  return ["processing", "transcribing", "analyzing"].includes(status);
}

function truncateFilename(name: string, max = 28): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = name.slice(0, Math.max(0, max - ext.length - 1));
  return `${stem}…${ext}`;
}

function rowMeta(
  item: MediaItem,
  copy: RecordingsCopy,
  uiLocale: string,
): string {
  if (item.status === "queued") {
    return copy.statusQueuedHint;
  }
  // S2: while processing / failed without a human title, show filename so rows differ.
  const needFile =
    !(item.title ?? "").trim() &&
    (item.status === "failed" ||
      ["uploaded", "processing", "transcribing", "analyzing", "uploading"].includes(
        item.status,
      ));
  return joinMeta([
    formatMeetingDay(item.meeting_date, uiLocale),
    formatDurationMs(item.duration_ms),
    languageLabel(item.language, uiLocale),
    needFile ? truncateFilename(item.filename) : null,
  ]);
}

export function RecordingsPanel({
  copy,
  recordingBaseHref,
  deletedToast,
}: Props) {
  const tApp = useTranslations("app");
  const uiLocale = useLocale();
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<File[]>([]);
  const pumping = useRef(false);
  const uploadOptsRef = useRef<{
    language?: string;
    speakersExpected?: number;
    vocabulary?: string;
    audioStreamIndex?: number;
    meetingBundle?: boolean;
    minutesTemplate?: string;
  }>({});
  const { push: pushToast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const preferredTemplate =
    user?.preferred_minutes_template === "official_protocol"
      ? "official_protocol"
      : "default";
  const provisional = copy.provisionalMeeting ?? tApp("provisionalMeeting");
  const [renameTarget, setRenameTarget] = useState<MediaItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const rawSeed = useSyncExternalStore(
    subscribeRecordingsListCache,
    peekRecordingsListCache,
    () => null,
  );
  // Only reuse cache after /api/me and only for this user (B4).
  const seed = userId && rawSeed?.userId === userId ? rawSeed : null;
  // null = still following seed (back-nav); non-null = local edits / fetches.
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(() => !(seed?.items.length));
  const [loadingMore, setLoadingMore] = useState(false);
  const [drag, setDrag] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [debouncedQ, setDebouncedQ] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [enterIds, setEnterIds] = useState<Set<string>>(new Set());
  const listAbortRef = useRef<AbortController | null>(null);
  const resolvedQuery = query ?? seed?.query ?? "";
  const resolvedDebouncedQ = debouncedQ ?? seed?.query ?? "";
  const resolvedItems = useMemo(
    () => items ?? seed?.items ?? [],
    [items, seed?.items],
  );
  const resolvedCursor =
    nextCursor === undefined ? (seed?.nextCursor ?? null) : nextCursor;
  const debouncedQRef = useRef(resolvedDebouncedQ);
  const nextCursorRef = useRef(resolvedCursor);
  const itemsRef = useRef(resolvedItems);
  const restoreScrollRef = useRef(0);
  const lastFetchedQRef = useRef<string | null>(null);
  const didRestoreScrollRef = useRef(false);
  const scrollRestorationSet = useRef(false);
  const [details, setDetails] = useState<{
    files: File[];
    language: string;
    speakersExpected: string;
    vocabulary: string;
    audioStreamIndex: string;
    tracks: MediaProbe["audio_tracks"];
    probing: boolean;
    meetingBundle: boolean;
    minutesTemplate: string;
  } | null>(null);

  const persistCache = useCallback(
    (nextItems: MediaItem[], cursor: string | null, q: string) => {
      if (!userId) return;
      saveRecordingsListCache({
        userId,
        items: nextItems,
        nextCursor: cursor,
        query: q,
        scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      });
    },
    [userId],
  );

  const loadFirstPage = useCallback(
    async (q: string, opts?: { soft?: boolean }) => {
      listAbortRef.current?.abort();
      setLoadingMore(false);
      const ac = new AbortController();
      listAbortRef.current = ac;
      const soft = Boolean(opts?.soft);
      if (!soft) setBusy(true);
      setError(null);
      try {
        const list = await listMedia({
          limit: PAGE_SIZE,
          q: q || undefined,
          signal: ac.signal,
        });
        if (ac.signal.aborted || debouncedQRef.current !== q) return;
        const prev = itemsRef.current;
        const merged =
          soft && prev.length > 0
            ? mergeFirstPage(prev, list.items, list.next_cursor)
            : list.items;
        const keepOlder =
          soft && Boolean(list.next_cursor) && merged.length > list.items.length;
        const cursor = keepOlder ? nextCursorRef.current : list.next_cursor;
        itemsRef.current = merged;
        setItems(merged);
        if (!keepOlder) {
          setNextCursor(list.next_cursor);
          nextCursorRef.current = list.next_cursor;
        }
        if (soft && restoreScrollRef.current > 0) {
          window.scrollTo(0, restoreScrollRef.current);
        }
        persistCache(merged, cursor, q);
        if (soft && restoreScrollRef.current > 0) {
          const y = restoreScrollRef.current;
          requestAnimationFrame(() => window.scrollTo(0, y));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(copy.error);
      } finally {
        if (!ac.signal.aborted && !soft) setBusy(false);
      }
    },
    [copy.error, persistCache],
  );

  useEffect(() => {
    itemsRef.current = resolvedItems;
  }, [resolvedItems]);

  useEffect(() => {
    nextCursorRef.current = resolvedCursor;
  }, [resolvedCursor]);

  useEffect(() => {
    debouncedQRef.current = resolvedDebouncedQ;
  }, [resolvedDebouncedQ]);

  useEffect(() => {
    if (userId && rawSeed && rawSeed.userId !== userId) {
      clearRecordingsListCache();
    }
  }, [userId, rawSeed]);

  useEffect(() => {
    if (scrollRestorationSet.current) return;
    scrollRestorationSet.current = true;
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    if (seed?.scrollY) {
      restoreScrollRef.current = seed.scrollY;
    }
    return () => {
      if ("scrollRestoration" in history) {
        history.scrollRestoration = "auto";
      }
    };
  }, [seed?.scrollY]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedQ(resolvedQuery.trim()),
      250,
    );
    return () => window.clearTimeout(t);
  }, [resolvedQuery]);

  useEffect(() => {
    const q = resolvedDebouncedQ;
    const qChanged =
      lastFetchedQRef.current !== null && lastFetchedQRef.current !== q;
    // Soft when we already have rows for this query (back-nav / Strict remount).
    const soft = !qChanged && itemsRef.current.length > 0;
    lastFetchedQRef.current = q;
    if (soft && !didRestoreScrollRef.current) {
      didRestoreScrollRef.current = true;
      const y = restoreScrollRef.current;
      if (y > 0) {
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    }
    void loadFirstPage(q, { soft });
    return () => {
      listAbortRef.current?.abort();
    };
  }, [resolvedDebouncedQ, loadFirstPage]);

  // Persist only on unmount — dependency cleanups would rewrite stale page-1 snapshots.
  useEffect(() => {
    return () => {
      if (!userId) return;
      saveRecordingsListCache({
        userId,
        items: itemsRef.current,
        nextCursor: nextCursorRef.current,
        query: debouncedQRef.current,
        scrollY: window.scrollY,
      });
    };
  }, [userId]);

  useEffect(() => {
    const activeIds = resolvedItems
      .filter((m) => ACTIVE.has(m.status))
      .map((m) => m.id);
    if (!activeIds.length) return;

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const statuses = await listMediaStatus(activeIds.slice(0, 20));
        if (cancelled || !statuses.length) return;
        setItems((prev) => {
          const base = prev ?? itemsRef.current;
          const map = new Map(statuses.map((s) => [s.id, s]));
          let changed = false;
          const next = base.map((item) => {
            const s = map.get(item.id);
            if (!s) return item;
            const nextCount = s.speaker_count ?? item.speaker_count ?? 0;
            if (
              s.status === item.status &&
              (s.error ?? null) === (item.error ?? null) &&
              (s.duration_ms ?? null) === (item.duration_ms ?? null) &&
              nextCount === (item.speaker_count ?? 0)
            ) {
              return item;
            }
            changed = true;
            return {
              ...item,
              status: s.status,
              error: s.error ?? null,
              duration_ms: s.duration_ms ?? item.duration_ms,
              quality_warning: s.quality_warning ?? item.quality_warning,
              speaker_count: nextCount,
            };
          });
          if (changed) {
            itemsRef.current = next;
            persistCache(next, nextCursorRef.current, debouncedQRef.current);
          }
          return changed ? next : base;
        });
      } catch {
        /* ignore poll errors */
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, 4000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [resolvedItems, persistCache]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMore) return;
    const qAtStart = debouncedQRef.current;
    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;
    setLoadingMore(true);
    try {
      const list = await listMedia({
        limit: PAGE_SIZE,
        cursor,
        q: qAtStart || undefined,
        signal: ac.signal,
      });
      if (ac.signal.aborted || debouncedQRef.current !== qAtStart) return;
      setItems((prev) => {
        const base = prev ?? itemsRef.current;
        const seen = new Set(base.map((m) => m.id));
        const merged = [...base, ...list.items.filter((m) => !seen.has(m.id))];
        itemsRef.current = merged;
        persistCache(merged, list.next_cursor, qAtStart);
        return merged;
      });
      setNextCursor(list.next_cursor);
      nextCursorRef.current = list.next_cursor;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(copy.error);
    } finally {
      // Always clear — aborted loadMore must not leave the button stuck (S6).
      setLoadingMore(false);
    }
  }, [loadingMore, copy.error, persistCache]);

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-recordings-menu="${menuId}"]`)) return;
      setMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  const markEnter = useCallback((id: string) => {
    setEnterIds((cur) => {
      const next = new Set(cur);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setEnterIds((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
    }, 400);
  }, []);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    while (queueRef.current.length > 0) {
      const file = queueRef.current.shift()!;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setUploadName(file.name);
      setProgress(0);
      setError(null);
      try {
        const opts = uploadOptsRef.current;
        const created = await uploadMedia(file, {
          onProgress: setProgress,
          signal: ac.signal,
          language: opts.language,
          speakersExpected: opts.speakersExpected,
          vocabulary: opts.vocabulary,
          audioStreamIndex: opts.audioStreamIndex,
          minutesTemplate: opts.minutesTemplate,
        });
        setItems((prev) => {
          const base = prev ?? itemsRef.current;
          const next = [created, ...base.filter((m) => m.id !== created.id)];
          itemsRef.current = next;
          return next;
        });
        markEnter(created.id);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          queueRef.current = [];
        } else if (err instanceof ApiError && err.status === 413) {
          setError(copy.tooLarge);
        } else {
          setError(copy.error);
        }
      } finally {
        abortRef.current = null;
      }
    }
    setUploadName(null);
    setProgress(0);
    pumping.current = false;
  }, [copy.error, copy.tooLarge, markEnter]);

  const uploadBundle = useCallback(
    async (files: File[]) => {
      if (pumping.current || files.length < 2) return;
      pumping.current = true;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setUploadName(files.map((f) => f.name).join(" + "));
      setProgress(0);
      setError(null);
      try {
        const opts = uploadOptsRef.current;
        const created = await uploadMedia(files, {
          meetingBundle: true,
          onProgress: setProgress,
          signal: ac.signal,
          language: opts.language,
          vocabulary: opts.vocabulary,
          minutesTemplate: opts.minutesTemplate,
        });
        setItems((prev) => {
          const base = prev ?? itemsRef.current;
          const next = [created, ...base.filter((m) => m.id !== created.id)];
          itemsRef.current = next;
          return next;
        });
        markEnter(created.id);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          /* cancelled */
        } else if (err instanceof ApiError && err.status === 413) {
          setError(copy.uploadBundleTooLarge ?? copy.tooLarge);
        } else {
          setError(copy.error);
        }
      } finally {
        abortRef.current = null;
        setUploadName(null);
        setProgress(0);
        pumping.current = false;
      }
    },
    [copy.error, copy.tooLarge, copy.uploadBundleTooLarge, markEnter],
  );

  const openDetails = useCallback(
    (list: FileList | File[] | null) => {
      if (!list?.length) return;
      const accepted: File[] = [];
      for (const file of Array.from(list)) {
        if (!isAcceptedUpload(file)) {
          setError(copy.badType);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(copy.tooLarge);
          continue;
        }
        accepted.push(file);
      }
      if (!accepted.length) return;
      const asBundle = accepted.length >= 2;
      const totalBytes = accepted.reduce((sum, f) => sum + f.size, 0);
      if (asBundle && totalBytes > MAX_UPLOAD_BYTES) {
        setError(
          copy.uploadBundleTooLarge ?? "Together over 500 MB. Remove a file or upload fewer tracks.",
        );
        return;
      }
      setError(null);
      setDetails({
        files: accepted,
        language: "",
        speakersExpected: "",
        vocabulary: "",
        audioStreamIndex: "0",
        tracks: [],
        probing: !asBundle,
        meetingBundle: asBundle,
        minutesTemplate: preferredTemplate,
      });
      if (asBundle) return;
      const first = accepted[0]!;
      void probeMediaUpload(first)
        .then((probe) => {
          setDetails((cur) =>
            cur
              ? {
                  ...cur,
                  tracks: probe.audio_tracks,
                  audioStreamIndex: "0",
                  probing: false,
                }
              : cur,
          );
        })
        .catch(() => {
          setDetails((cur) => (cur ? { ...cur, probing: false, tracks: [] } : cur));
        });
    },
    [copy.badType, copy.tooLarge, copy.uploadBundleTooLarge, preferredTemplate],
  );

  const confirmDetails = useCallback(() => {
    if (!details?.files.length) return;
    const asBundle = details.meetingBundle && details.files.length >= 2;
    uploadOptsRef.current = {
      language: details.language || undefined,
      speakersExpected:
        !asBundle && details.speakersExpected
          ? Number(details.speakersExpected)
          : undefined,
      vocabulary: details.vocabulary.trim() || undefined,
      audioStreamIndex:
        !asBundle && details.tracks.length > 1
          ? Number(details.audioStreamIndex || 0)
          : undefined,
      meetingBundle: asBundle,
      minutesTemplate: details.minutesTemplate || preferredTemplate,
    };
    const files = details.files;
    setDetails(null);
    if (asBundle) {
      void uploadBundle(files);
      return;
    }
    for (const file of files) queueRef.current.push(file);
    void pump();
  }, [details, pump, preferredTemplate, uploadBundle]);

  const enqueue = openDetails;

  useEffect(() => {
    function onFiles(e: Event) {
      const ce = e as CustomEvent<FileList>;
      if (ce.detail) enqueue(ce.detail);
    }
    window.addEventListener("dictably:files", onFiles as EventListener);
    return () => {
      window.removeEventListener("dictably:files", onFiles as EventListener);
    };
  }, [enqueue]);

  // Defer stashed drops so setState is not sync inside effect (lint B1).
  useEffect(() => {
    const stashed = takeStashedFiles();
    if (!stashed.length) return;
    const id = window.setTimeout(() => enqueue(stashed), 0);
    return () => window.clearTimeout(id);
  }, [enqueue]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMedia(pendingDelete.id);
      setItems((prev) => {
        const next = (prev ?? itemsRef.current).filter(
          (m) => m.id !== pendingDelete.id,
        );
        itemsRef.current = next;
        return next;
      });
      setPendingDelete(null);
      pushToast(deletedToast);
    } catch {
      setError(copy.error);
    } finally {
      setDeleting(false);
    }
  }

  const uploading = uploadName != null;
  const showBusy = busy && resolvedItems.length === 0;
  const searchDim = busy && resolvedItems.length > 0;
  const showDropzone =
    (resolvedItems.length > 0 && resolvedItems.length <= 3) || uploading;
  const showSearch =
    resolvedItems.length >= 5 || Boolean(resolvedDebouncedQ.trim());
  const showAllLabel =
    !resolvedCursor && resolvedItems.length > PAGE_SIZE
      ? copy.allRecordings.replace("{n}", String(resolvedItems.length))
      : null;
  const menuItem =
    menuId != null
      ? resolvedItems.find((m) => m.id === menuId) ?? null
      : null;

  async function saveRename() {
    if (!renameTarget) return;
    setRenameBusy(true);
    try {
      const updated = await patchMedia(renameTarget.id, {
        title: renameDraft.trim() || null,
      });
      setItems((prev) => {
        const base = prev ?? itemsRef.current;
        const next = base.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
        itemsRef.current = next;
        return next;
      });
      setRenameTarget(null);
    } catch {
      setError(copy.error);
    } finally {
      setRenameBusy(false);
    }
  }

  function openRename(item: MediaItem) {
    setMenuId(null);
    setRenameDraft(
      (item.title ?? "").trim() ||
        mediaDisplayTitle(item, uiLocale, provisional),
    );
    setRenameTarget(item);
  }

  const uploadDetailsBody = details ? (
    <div className="rec-upload-details" data-recordings="upload-details">
      <p className="dy-muted">
        {details.files.map((f) => f.name).join(", ")}
      </p>
      {details.files.length >= 2 ? (
        <label className="rec-upload-details__check" data-recordings="upload-meeting-bundle">
          <input
            type="checkbox"
            checked={details.meetingBundle}
            onChange={(e) => {
              const on = e.target.checked;
              setDetails({
                ...details,
                meetingBundle: on,
                probing: !on && details.tracks.length === 0,
              });
              if (!on && details.tracks.length === 0) {
                const first = details.files[0]!;
                void probeMediaUpload(first)
                  .then((probe) => {
                    setDetails((cur) =>
                      cur
                        ? {
                            ...cur,
                            tracks: probe.audio_tracks,
                            audioStreamIndex: "0",
                            probing: false,
                          }
                        : cur,
                    );
                  })
                  .catch(() => {
                    setDetails((cur) =>
                      cur ? { ...cur, probing: false, tracks: [] } : cur,
                    );
                  });
              }
            }}
          />
          <span>
            {copy.uploadMeetingBundle ??
              "One meeting — each file is a speaker"}
          </span>
        </label>
      ) : null}
      {details.meetingBundle && details.files.length >= 2 ? (
        <p className="dy-muted" data-recordings="upload-meeting-hint">
          {copy.uploadMeetingBundleHint ??
            "Names from filenames (e.g. audioOlena.m4a)."}
        </p>
      ) : null}
      <label>
        <span>{copy.uploadLanguageLabel ?? "Language"}</span>
        <select
          value={details.language}
          data-recordings="upload-language"
          onChange={(e) =>
            setDetails({ ...details, language: e.target.value })
          }
        >
          <option value="">{copy.uploadLanguageAuto ?? "Auto"}</option>
          <option value="en">English</option>
          <option value="uk">Ukrainian</option>
          <option value="ru">Russian</option>
          <option value="pl">Polish</option>
          <option value="de">German</option>
          <option value="es">Spanish</option>
        </select>
      </label>
      <label>
        <span>{copy.uploadSpeakersLabel ?? "How many participants?"}</span>
        <select
          value={details.speakersExpected}
          data-recordings="upload-speakers"
          onChange={(e) =>
            setDetails({ ...details, speakersExpected: e.target.value })
          }
        >
          <option value="">{copy.uploadSpeakersAuto ?? "Auto"}</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{copy.uploadTemplateLabel ?? "Minutes template"}</span>
        <select
          value={details.minutesTemplate}
          data-recordings="upload-template"
          onChange={(e) =>
            setDetails({ ...details, minutesTemplate: e.target.value })
          }
        >
          <option value="default">
            {copy.minutesTemplateDefault ?? "Minutes"}
          </option>
          <option value="official_protocol">
            {copy.minutesTemplateOfficial ?? "Official protocol"}
          </option>
        </select>
      </label>
      <label>
        <span>{copy.uploadVocabLabel ?? "Names & terms"}</span>
        <input
          type="text"
          value={details.vocabulary}
          data-recordings="upload-vocab"
          placeholder={copy.uploadVocabHint ?? "Comma-separated"}
          onChange={(e) =>
            setDetails({ ...details, vocabulary: e.target.value })
          }
        />
      </label>
      {!details.meetingBundle && details.tracks.length > 1 ? (
        <label>
          <span>{copy.uploadTrackLabel ?? "Audio track"}</span>
          <select
            value={details.audioStreamIndex}
            data-recordings="upload-track"
            onChange={(e) =>
              setDetails({ ...details, audioStreamIndex: e.target.value })
            }
          >
            {details.tracks.map((tr) => (
              <option key={tr.index} value={String(tr.index)}>
                {tr.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {details.probing ? <p className="dy-muted">…</p> : null}
    </div>
  ) : null;

  const uploadDetailsActions = (
    <>
      <Button variant="secondary" onClick={() => setDetails(null)}>
        {copy.cancel}
      </Button>
      <Button
        onClick={confirmDetails}
        disabled={details?.probing}
        data-recordings="upload-details-continue"
      >
        {copy.uploadDetailsContinue ?? copy.uploadCta}
      </Button>
    </>
  );

  return (
    <section className="recordings" data-recordings="panel">
      <div className={`app-main__toolbar${isMobile ? " is-mobile-stack" : ""}`}>
        <h1 className="dy-type-title" style={{ margin: 0 }}>
          Recordings
        </h1>
        <span className="app-main__toolbar-spacer" />
        {showSearch ? (
          <label className="app-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              type="search"
              value={resolvedQuery}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
              data-recordings="search"
            />
          </label>
        ) : null}
        <button
          type="button"
          className={`btn-primary${isMobile ? " recordings__upload-full" : ""}`}
          data-recordings="choose"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {copy.uploadCta}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          data-recordings="file"
          aria-label={copy.uploadCta}
          multiple
          onChange={(e) => {
            enqueue(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {showDropzone ? (
        <div
          className={`dy-upload${drag ? " is-drag" : ""}${uploading ? " is-busy" : ""}`}
          data-recordings="upload"
          onDragEnter={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            enqueue(e.dataTransfer.files);
          }}
        >
          {uploading ? (
            <>
              <div className="dy-upload__ill" aria-hidden>
                <IllProcessing />
              </div>
              <p className="dy-upload__title">{uploadName}</p>
              <p className="dy-upload__hint">
                {copy.uploading.replace("{pct}", String(progress))}
              </p>
              <div
                className="dy-progress dy-progress--smooth"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div className="dy-progress__fill" style={{ width: `${progress}%` }} />
              </div>
              <button
                type="button"
                className="btn-secondary"
                data-recordings="cancel"
                onClick={() => abortRef.current?.abort()}
              >
                {copy.cancel}
              </button>
            </>
          ) : (
            <>
              <p className="dy-upload__title">{drag ? copy.drop : copy.title}</p>
              <p className="dy-upload__hint">{copy.hint}</p>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" data-recordings="error">
          {error}
        </Alert>
      ) : null}

      <div className="recordings__list" data-recordings="list">
        {showBusy ? (
          <div className="app-skel-list" aria-busy="true">
            <div className="app-skel app-skel--row" />
            <div className="app-skel app-skel--row" />
            <div className="app-skel app-skel--row" />
          </div>
        ) : resolvedItems.length === 0 ? (
          <div data-recordings="empty">
            {resolvedDebouncedQ ? (
              <EmptyState
                title={copy.searchEmpty.replace("{q}", resolvedDebouncedQ)}
                illustration={<IllEmptyRecordings />}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setQuery("")}
                    data-recordings="clear-search"
                  >
                    {copy.clearSearch}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={copy.empty}
                illustration={<IllEmptyRecordings />}
                action={
                  <Button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    data-recordings="empty-upload"
                  >
                    {copy.uploadCta}
                  </Button>
                }
              >
                {copy.emptyBody}
              </EmptyState>
            )}
          </div>
        ) : (
          <>
            <div className={`dy-list${searchDim ? " is-searching" : ""}`}>
              {resolvedItems.map((item) => {
                const st = toRowStatus(item.status);
                const delBusy = isDeleteBusy(item.status);
                const href =
                  item.status === "ready"
                    ? `${recordingBaseHref}?id=${encodeURIComponent(item.id)}`
                    : undefined;
                const enter = enterIds.has(item.id);
                const displayTitle = mediaDisplayTitle(
                  item,
                  uiLocale,
                  provisional,
                );
                return (
                  <div
                    key={item.id}
                    className={enter ? "dy-list__enter" : undefined}
                  >
                    <RecordingRow
                      title={displayTitle}
                      meta={rowMeta(item, copy, uiLocale)}
                      status={st}
                      statusLabel={statusLabel(item.status, copy)}
                      statusHint={statusHintFor(item, copy)}
                      speakers={item.speaker_count ?? 0}
                      href={href}
                      muted={searchDim}
                      {...{
                        "data-recordings": "row",
                        "data-filename": item.filename,
                        "data-media-id": item.id,
                      }}
                      action={
                        <div
                          className="dy-rec__menu"
                          data-recordings-menu={item.id}
                        >
                          <button
                            type="button"
                            className="dy-rec__menu-btn"
                            aria-label={copy.menuLabel}
                            aria-expanded={menuId === item.id}
                            data-recordings="menu"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuId((cur) =>
                                cur === item.id ? null : item.id,
                              );
                            }}
                          >
                            ···
                          </button>
                          {!isMobile && menuId === item.id ? (
                            <div className="dy-rec__menu-pop" role="menu">
                              <button
                                type="button"
                                className="dy-rec__menu-item"
                                role="menuitem"
                                data-recordings="rename"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openRename(item);
                                }}
                              >
                                {copy.renameLabel ?? tApp("renameRecording")}
                              </button>
                              {item.status === "ready" ? (
                                <a
                                  className="dy-rec__menu-item"
                                  role="menuitem"
                                  data-recordings="download"
                                  href={mediaAudioUrl(item.id)}
                                  download={item.filename}
                                  onClick={() => setMenuId(null)}
                                >
                                  {copy.downloadLabel ?? tApp("downloadRecording")}
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="dy-rec__menu-item dy-rec__menu-item--danger"
                                role="menuitem"
                                data-recordings="delete"
                                disabled={delBusy}
                                title={delBusy ? copy.deleteBusyHint : undefined}
                                aria-disabled={delBusy || undefined}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (delBusy) return;
                                  setMenuId(null);
                                  setPendingDelete(item);
                                }}
                              >
                                {copy.deleteLabel}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      }
                    />
                  </div>
                );
              })}
            </div>
            {resolvedCursor ? (
              <div className="recordings__more">
                <Button
                  variant="secondary"
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                  data-recordings="show-more"
                >
                  {copy.showMore}
                </Button>
              </div>
            ) : showAllLabel ? (
              <p className="recordings__all" data-recordings="all-done">
                {showAllLabel}
              </p>
            ) : null}
          </>
        )}
      </div>

      <Dialog
        open={pendingDelete != null}
        title={copy.deleteConfirmTitle}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
              data-recordings="delete-keep"
            >
              {copy.keepLabel}
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => void confirmDelete()}
              data-recordings="delete-confirm"
            >
              {copy.deleteConfirmAction}
            </Button>
          </>
        }
      >
        <div className="dy-dialog__ill" aria-hidden data-recordings="delete-ill">
          <IllDeleted />
        </div>
        <p>
          {copy.deleteConfirmBody.replace(
            "{name}",
            pendingDelete
              ? mediaDisplayTitle(pendingDelete, uiLocale, provisional)
              : "",
          )}
        </p>
      </Dialog>

      <Dialog
        open={renameTarget != null}
        title={copy.renameTitle ?? tApp("renameRecordingTitle")}
        onClose={() => {
          if (!renameBusy) setRenameTarget(null);
        }}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={renameBusy}
              onClick={() => setRenameTarget(null)}
            >
              {copy.cancel}
            </Button>
            <Button
              loading={renameBusy}
              onClick={() => void saveRename()}
              data-recordings="rename-save"
            >
              {copy.renameSave ?? tApp("renameRecordingSave")}
            </Button>
          </>
        }
      >
        <label className="dy-field">
          <span className="visually-hidden">
            {copy.renameTitle ?? tApp("renameRecordingTitle")}
          </span>
          <input
            type="text"
            value={renameDraft}
            maxLength={120}
            data-recordings="rename-input"
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveRename();
            }}
          />
        </label>
        {renameTarget ? (
          <p className="dy-muted" data-recordings="rename-filename">
            {renameTarget.filename}
          </p>
        ) : null}
      </Dialog>

      {isMobile ? (
        <BottomSheet
          open={details != null}
          title={copy.uploadDetailsTitle ?? "Upload details"}
          onClose={() => setDetails(null)}
          actions={uploadDetailsActions}
        >
          {uploadDetailsBody}
        </BottomSheet>
      ) : (
        <Dialog
          open={details != null}
          title={copy.uploadDetailsTitle ?? "Upload details"}
          onClose={() => setDetails(null)}
          actions={uploadDetailsActions}
        >
          {uploadDetailsBody}
        </Dialog>
      )}

      {isMobile ? (
        <BottomSheet
          open={menuItem != null}
          title={
            menuItem
              ? mediaDisplayTitle(menuItem, uiLocale, provisional)
              : copy.menuLabel
          }
          onClose={() => setMenuId(null)}
        >
          {menuItem ? (
            <div className="dy-sheet__list" role="menu" data-recordings="row-sheet">
              <button
                type="button"
                role="menuitem"
                data-recordings="rename"
                onClick={() => openRename(menuItem)}
              >
                {copy.renameLabel ?? tApp("renameRecording")}
              </button>
              {menuItem.status === "ready" ? (
                <a
                  role="menuitem"
                  data-recordings="download"
                  href={mediaAudioUrl(menuItem.id)}
                  download={menuItem.filename}
                  onClick={() => setMenuId(null)}
                >
                  {copy.downloadLabel ?? tApp("downloadRecording")}
                </a>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                data-recordings="delete"
                disabled={isDeleteBusy(menuItem.status)}
                onClick={() => {
                  if (isDeleteBusy(menuItem.status)) return;
                  setMenuId(null);
                  setPendingDelete(menuItem);
                }}
              >
                {copy.deleteLabel}
              </button>
            </div>
          ) : null}
        </BottomSheet>
      ) : null}
    </section>
  );
}
