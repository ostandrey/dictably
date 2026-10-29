"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/app/ToastProvider";
import { IllEmptyRecordings, IllProcessing } from "@/components/illustrations";
import {
  ApiError,
  deleteMedia,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api";
import { takeStashedFiles } from "@/lib/fileQueue";
import { ACCEPT, isAcceptedUpload, MAX_UPLOAD_BYTES } from "@/lib/uploadAccept";
import { Alert, Button, Dialog, EmptyState, RecordingRow } from "@/components/ui";
import type { RecordingStatus } from "@/components/ui";

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
  badType: string;
  error: string;
  statusUploaded: string;
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
};

type Props = {
  copy: RecordingsCopy;
  recordingBaseHref: string;
  deletedToast: string;
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

function isDeleteBusy(status: string): boolean {
  return ["processing", "transcribing", "analyzing"].includes(status);
}

function rowMeta(item: MediaItem): string {
  const parts = [
    formatDate(item.created_at),
    formatDuration(item.duration_ms),
    languageLabel(item.language),
  ];
  return parts.join(" · ");
}

export function RecordingsPanel({
  copy,
  recordingBaseHref,
  deletedToast,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<File[]>([]);
  const pumping = useRef(false);
  const { push: pushToast } = useToast();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [drag, setDrag] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [enterIds, setEnterIds] = useState<Set<string>>(new Set());

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
        const created = await uploadMedia(file, {
          onProgress: setProgress,
          signal: ac.signal,
        });
        setItems((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);
        setEnterIds((cur) => {
          const next = new Set(cur);
          next.add(created.id);
          return next;
        });
        window.setTimeout(() => {
          setEnterIds((cur) => {
            const next = new Set(cur);
            next.delete(created.id);
            return next;
          });
        }, 400);
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
  }, [copy.error, copy.tooLarge]);

  const enqueue = useCallback(
    (list: FileList | File[] | null) => {
      if (!list?.length) return;
      for (const file of Array.from(list)) {
        if (!isAcceptedUpload(file)) {
          setError(copy.badType);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(copy.tooLarge);
          continue;
        }
        queueRef.current.push(file);
      }
      void pump();
    },
    [copy.badType, copy.tooLarge, pump],
  );

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
      setItems((prev) => prev.filter((m) => m.id !== pendingDelete.id));
      setPendingDelete(null);
      pushToast(deletedToast);
    } catch {
      setError(copy.error);
    } finally {
      setDeleting(false);
    }
  }

  const uploading = uploadName != null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.filename.toLowerCase().includes(q));
  }, [items, query]);

  const showDropzone = (items.length > 0 && items.length <= 3) || uploading;

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
        {busy ? (
          <div className="app-skel-list" aria-busy="true">
            <div className="app-skel app-skel--row" />
            <div className="app-skel app-skel--row" />
            <div className="app-skel app-skel--row" />
          </div>
        ) : filtered.length === 0 ? (
          <div data-recordings="empty">
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
          </div>
        ) : (
          <div className="dy-list">
            {filtered.map((item) => {
              const st = toRowStatus(item.status);
              const delBusy = isDeleteBusy(item.status);
              const href =
                item.status === "ready"
                  ? `${recordingBaseHref}?id=${encodeURIComponent(item.id)}`
                  : undefined;
              const enter = enterIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={enter ? "dy-list__enter" : undefined}
                >
                  <RecordingRow
                    title={item.filename}
                    meta={rowMeta(item)}
                    status={st}
                    statusLabel={statusLabel(item.status, copy)}
                    speakers={item.speaker_count ?? 0}
                    href={href}
                    {...{ "data-recordings": "row" }}
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
                        {menuId === item.id ? (
                          <div className="dy-rec__menu-pop" role="menu">
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
        <p>
          {copy.deleteConfirmBody.replace(
            "{name}",
            pendingDelete?.filename ?? "",
          )}
        </p>
      </Dialog>
    </section>
  );
}
