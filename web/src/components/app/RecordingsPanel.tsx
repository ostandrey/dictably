"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api";
import { Alert, EmptyState, RecordingRow } from "@/components/ui";
import type { RecordingStatus } from "@/components/ui";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const ACCEPT =
  ".mp3,.m4a,.wav,.ogg,.oga,.flac,.aac,.mp4,.mov,.webm,.mkv,audio/*,video/*";

export type RecordingsCopy = {
  title: string;
  hint: string;
  choose: string;
  drop: string;
  uploading: string;
  cancel: string;
  empty: string;
  searchPlaceholder: string;
  uploadCta: string;
  tooLarge: string;
  error: string;
  statusUploaded: string;
  statusProcessing: string;
  statusReady: string;
  statusFailed: string;
};

type Props = {
  copy: RecordingsCopy;
  /** Base path without trailing id, e.g. /app/r/ or /uk/app/r/ */
  recordingBaseHref: string;
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function languageLabel(code: string | null | undefined): string {
  if (!code) return "—";
  try {
    const dn = new Intl.DisplayNames(undefined, { type: "language" });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

function statusLabel(status: string, copy: RecordingsCopy): string {
  switch (status) {
    case "uploaded":
      return copy.statusUploaded;
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

function toRowStatus(status: string): RecordingStatus {
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  if (status === "uploading") return "uploading";
  return "processing";
}

function rowMeta(item: MediaItem): string {
  const parts = [
    formatDate(item.created_at),
    formatDuration(item.duration_ms),
    languageLabel(item.language),
  ];
  return parts.join(" · ");
}

export function RecordingsPanel({ copy, recordingBaseHref }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [drag, setDrag] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    const list = await listMedia();
    setItems(list.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch {
        if (!cancelled) setError(copy.error);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [copy.error, refresh]);

  useEffect(() => {
    const pending = items.some((m) =>
      ["uploaded", "processing", "transcribing", "analyzing"].includes(m.status),
    );
    if (!pending) return;
    const id = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, [items, refresh]);

  async function startUpload(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(copy.tooLarge);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setUploadName(file.name);
    setProgress(0);
    try {
      const created = await uploadMedia(file, {
        onProgress: setProgress,
        signal: ac.signal,
      });
      setItems((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        /* cancelled */
      } else if (err instanceof ApiError && err.status === 413) {
        setError(copy.tooLarge);
      } else {
        setError(copy.error);
      }
    } finally {
      setUploadName(null);
      setProgress(0);
      abortRef.current = null;
    }
  }

  function onFiles(list: FileList | null) {
    const file = list?.[0];
    if (file) void startUpload(file);
  }

  const uploading = uploadName != null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.filename.toLowerCase().includes(q));
  }, [items, query]);

  const showDropzone = items.length <= 3 || uploading;

  return (
    <section className="recordings" data-recordings="panel">
      <div className="app-main__toolbar">
        <h1 className="dy-type-title" style={{ margin: 0 }}>
          Recordings
        </h1>
        <span className="app-main__toolbar-spacer" />
        <label className="app-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            data-recordings="search"
          />
        </label>
        <button
          type="button"
          className="btn-primary"
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
          onChange={(e) => {
            onFiles(e.target.files);
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
            onFiles(e.dataTransfer.files);
          }}
        >
          {uploading ? (
            <>
              <p className="dy-upload__title">{uploadName}</p>
              <p className="dy-upload__hint">
                {copy.uploading.replace("{pct}", String(progress))}
              </p>
              <div
                className="dy-progress"
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
        {busy ? (
          <p className="dy-muted">{copy.empty}</p>
        ) : filtered.length === 0 ? (
          <div data-recordings="empty">
            <EmptyState title={copy.empty} />
          </div>
        ) : (
          <div className="dy-list">
            {filtered.map((item) => {
              const st = toRowStatus(item.status);
              const href =
                item.status === "ready"
                  ? `${recordingBaseHref}?id=${encodeURIComponent(item.id)}`
                  : undefined;
              return (
                <RecordingRow
                  key={item.id}
                  title={item.filename}
                  meta={rowMeta(item)}
                  status={st}
                  statusLabel={statusLabel(item.status, copy)}
                  speakers={item.speaker_count ?? 0}
                  href={href}
                  {...{ "data-recordings": "row" }}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
