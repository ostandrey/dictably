"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api";

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
        className={`upload-zone${drag ? " is-drag" : ""}${uploading ? " is-busy" : ""}`}
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
            <div className="upload-zone__row">
              <span className="upload-zone__name">{uploadName}</span>
              <span className="upload-zone__meta">
                {copy.uploading.replace("{pct}", String(progress))}
              </span>
            </div>
            <div
              className="upload-zone__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="upload-zone__progress-fill"
                style={{ width: `${progress}%` }}
              />
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
            <p className="upload-zone__title">
              {drag ? copy.drop : copy.title}
            </p>
            <p className="upload-zone__hint">{copy.hint}</p>
            <button
              type="button"
              className="btn-secondary"
              data-recordings="choose"
              onClick={() => inputRef.current?.click()}
            >
              {copy.choose}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="upload-zone__input"
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
        <p className="sign-in__error" role="alert" data-recordings="error">
          {error}
        </p>
      ) : null}

      <div className="recordings__list" data-recordings="list">
        <h2 className="recordings__heading">{copy.listTitle}</h2>
        {busy ? (
          <p className="app-shell__body">{copy.empty}</p>
        ) : items.length === 0 ? (
          <p className="app-shell__body" data-recordings="empty">
            {copy.empty}
          </p>
        ) : (
          <ul className="recordings__ul">
            {items.map((item) => (
              <li key={item.id} className="recordings__row" data-recordings="row">
                <div>
                  <p className="recordings__name">{item.filename}</p>
                  <p className="recordings__meta">
                    {statusLabel(item.status, copy)}
                    {" · "}
                    {formatBytes(item.size_bytes)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
