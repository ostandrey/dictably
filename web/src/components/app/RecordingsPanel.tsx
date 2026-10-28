"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api";
import { Alert, Badge, Button, EmptyState } from "@/components/ui";
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
  listTitle: string;
  tooLarge: string;
  error: string;
  statusUploaded: string;
  statusProcessing: string;
  statusReady: string;
  statusFailed: string;
};

type Props = {
  copy: RecordingsCopy;
};

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

function badgeTone(
  status: RecordingStatus,
): "success" | "accent" | "danger" | "neutral" {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  if (status === "uploading") return "neutral";
  return "accent";
}

export function RecordingsPanel({ copy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [drag, setDrag] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  // Poll while any recording is still processing (T-013/14).
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

  return (
    <section className="recordings" data-recordings="panel">
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
            <Button
              variant="secondary"
              data-recordings="cancel"
              onClick={() => abortRef.current?.abort()}
            >
              {copy.cancel}
            </Button>
          </>
        ) : (
          <>
            <p className="dy-upload__title">{drag ? copy.drop : copy.title}</p>
            <p className="dy-upload__hint">{copy.hint}</p>
            <Button
              variant="secondary"
              data-recordings="choose"
              onClick={() => inputRef.current?.click()}
            >
              {copy.choose}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              data-recordings="file"
              aria-label={copy.choose}
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {error ? (
        <Alert tone="danger" data-recordings="error">
          {error}
        </Alert>
      ) : null}

      <div className="recordings__list" data-recordings="list">
        <h2 className="dy-type-heading" style={{ margin: 0 }}>
          {copy.listTitle}
        </h2>
        {busy ? (
          <p className="dy-muted">{copy.empty}</p>
        ) : items.length === 0 ? (
          <div data-recordings="empty">
            <EmptyState title={copy.empty} />
          </div>
        ) : (
          <div className="dy-list">
            {items.map((item) => {
              const st = toRowStatus(item.status);
              return (
                <div key={item.id} className="dy-rec" data-recordings="row">
                  <div>
                    <p className="dy-rec__title">{item.filename}</p>
                    <p className="dy-rec__meta">{formatBytes(item.size_bytes)}</p>
                  </div>
                  <span />
                  <Badge tone={badgeTone(st)} dot>
                    {statusLabel(item.status, copy)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
