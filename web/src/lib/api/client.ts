/**
 * Thin fetch wrapper for same-origin `/api/*` (nginx rewrite / next.dev proxy).
 * Types come from schema.d.ts (generated — do not edit by hand).
 */

import type { components, paths } from "./schema";

type HealthResponse =
  paths["/api/health"]["get"]["responses"]["200"]["content"]["application/json"];
type AuthConfig =
  paths["/api/auth/config"]["get"]["responses"]["200"]["content"]["application/json"];
type User =
  paths["/api/me"]["get"]["responses"]["200"]["content"]["application/json"];
type MediaItem = components["schemas"]["MediaOut"];
type MediaList = { items: MediaItem[] };
type Transcript = components["schemas"]["TranscriptOut"];
type Speaker = components["schemas"]["SpeakerOut"];
type Analysis = components["schemas"]["AnalysisOut"];
type AdminUser = components["schemas"]["AdminUserOut"];
type AdminMedia = components["schemas"]["AdminMediaOut"];
type AdminJob = components["schemas"]["AdminJobOut"];
type AdminCosts = components["schemas"]["AdminCostsOut"];

export type {
  AuthConfig,
  User,
  MediaItem,
  MediaList,
  Transcript,
  Speaker,
  Analysis,
  AdminUser,
  AdminMedia,
  AdminJob,
  AdminCosts,
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie("dictably_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
    if (init?.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  }
  const res = await fetch(path, {
    ...init,
    method,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** GET /api/health — smoke check that the proxy reaches the backend. */
export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}

export function getAuthConfig(): Promise<AuthConfig> {
  return apiFetch<AuthConfig>("/api/auth/config");
}

export function getMe(): Promise<User> {
  return apiFetch<User>("/api/me");
}

export type ConsentBody = {
  marketing_opt_in?: boolean;
  timezone?: string | null;
  locale?: string | null;
  signup_utm?: Record<string, string> | null;
  signup_referrer?: string | null;
};

export type OnboardingBody = {
  skipped?: boolean;
  use_cases?: string[];
  meeting_locale?: string | null;
};

export type AccountExport = {
  exported_at: string;
  user: Record<string, unknown>;
  recordings: Array<Record<string, unknown>>;
};

export function postConsent(body: ConsentBody): Promise<User> {
  return apiFetch<User>("/api/me/consent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postOnboarding(body: OnboardingBody): Promise<User> {
  return apiFetch<User>("/api/me/onboarding", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function exportAccount(): Promise<AccountExport> {
  return apiFetch<AccountExport>("/api/me/export");
}

export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/api/me", { method: "DELETE" });
}

export function devLogin(
  email = "dev@example.com",
  name = "Dev User",
): Promise<User> {
  return apiFetch<User>("/api/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export async function listMedia(): Promise<MediaList> {
  const data = await apiFetch<{ items?: MediaItem[] }>("/api/media");
  return { items: data.items ?? [] };
}

export function getMedia(id: string): Promise<MediaItem> {
  return apiFetch<MediaItem>(`/api/media/${id}`);
}

export function deleteMedia(id: string): Promise<void> {
  return apiFetch<void>(`/api/media/${id}`, { method: "DELETE" });
}

export function getTranscript(id: string): Promise<Transcript> {
  return apiFetch<Transcript>(`/api/media/${id}/transcript`);
}

export function listSpeakers(id: string): Promise<Speaker[]> {
  return apiFetch<Speaker[]>(`/api/media/${id}/speakers`);
}

export function patchSpeaker(
  mediaId: string,
  speakerId: string,
  body: { display_name?: string | null; party?: string | null },
): Promise<Speaker> {
  return apiFetch<Speaker>(`/api/media/${mediaId}/speakers/${speakerId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function mergeSpeakers(
  mediaId: string,
  body: { keep_id: string; merge_ids: string[] },
): Promise<Speaker[]> {
  return apiFetch<Speaker[]>(`/api/media/${mediaId}/speakers/merge`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchSegmentSpeaker(
  mediaId: string,
  segmentId: string,
  speakerId: string,
): Promise<Transcript> {
  return apiFetch<Transcript>(
    `/api/media/${mediaId}/segments/${encodeURIComponent(segmentId)}/speaker`,
    {
      method: "PATCH",
      body: JSON.stringify({ speaker_id: speakerId }),
    },
  );
}

export function splitSegmentSpeaker(
  mediaId: string,
  segmentId: string,
): Promise<Transcript> {
  return apiFetch<Transcript>(
    `/api/media/${mediaId}/segments/${encodeURIComponent(segmentId)}/split-speaker`,
    { method: "POST" },
  );
}

export type MediaProbe = {
  audio_tracks: Array<{
    index: number;
    label: string;
    language?: string | null;
    channels?: number;
  }>;
  needs_track_choice: boolean;
};

export async function probeMediaUpload(file: File): Promise<MediaProbe> {
  const body = new FormData();
  body.append("file", file);
  const csrf = readCookie("dictably_csrf");
  const res = await fetch("/api/media/probe", {
    method: "POST",
    credentials: "include",
    headers: csrf ? { "X-CSRF-Token": csrf } : undefined,
    body,
  });
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  return (await res.json()) as MediaProbe;
}

export function patchWord(
  mediaId: string,
  body: { word_index: number; text: string },
): Promise<Transcript> {
  return apiFetch<Transcript>(`/api/media/${mediaId}/words`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function patchMedia(
  mediaId: string,
  body: {
    meeting_date?: string | null;
    vocabulary?: string[];
    transcript_mode?: string;
    language?: string | null;
    speakers_expected?: number | null;
  },
): Promise<MediaItem> {
  return apiFetch<MediaItem>(`/api/media/${mediaId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function getPeaks(id: string): Promise<number[]> {
  return apiFetch<number[]>(`/api/media/${id}/peaks`);
}

export function getAnalysis(id: string): Promise<Analysis> {
  return apiFetch<Analysis>(`/api/media/${id}/analysis`);
}

export function regenerateAnalysis(
  id: string,
  options: { template?: string } = {},
): Promise<Analysis> {
  return apiFetch<Analysis>(`/api/media/${id}/analysis`, {
    method: "POST",
    body:
      options.template != null
        ? JSON.stringify({ template: options.template })
        : undefined,
  });
}

/** Cookie-authenticated audio URL for &lt;audio src&gt;. */
export function mediaAudioUrl(id: string): string {
  return `/api/media/${id}/audio`;
}

export type ExportKind = "minutes" | "transcript";
export type ExportFormat = "docx" | "pdf" | "md" | "txt" | "srt" | "vtt";

/** Same-origin download URL for T-017 exports (cookies apply on navigation/fetch). */
export function mediaExportUrl(
  id: string,
  kind: ExportKind,
  format: ExportFormat,
): string {
  const q = new URLSearchParams({ kind, format });
  return `/api/media/${id}/export?${q.toString()}`;
}

/** Fetch export as blob (credentials) and trigger a download. */
export async function downloadMediaExport(
  id: string,
  kind: ExportKind,
  format: ExportFormat,
): Promise<void> {
  const res = await fetch(mediaExportUrl(id, kind, format), {
    credentials: "include",
    headers: { Accept: "*/*" },
  });
  if (!res.ok) {
    throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="([^"]+)"/i.exec(cd);
  const name = star
    ? decodeURIComponent(star[1])
    : plain?.[1] || `export.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetch minutes markdown for clipboard (Copy as text). */
export async function fetchMinutesMarkdown(id: string): Promise<string> {
  const res = await fetch(mediaExportUrl(id, "minutes", "md"), {
    credentials: "include",
    headers: { Accept: "text/markdown, text/plain" },
  });
  if (!res.ok) {
    throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  }
  return res.text();
}

export async function adminListUsers(): Promise<{ items: AdminUser[] }> {
  const data = await apiFetch<{ items?: AdminUser[] }>("/api/admin/users");
  return { items: data.items ?? [] };
}

export async function adminListMedia(
  status?: string,
): Promise<{ items: AdminMedia[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<{ items?: AdminMedia[] }>(`/api/admin/media${q}`);
  return { items: data.items ?? [] };
}

export async function adminListJobs(
  status?: string,
): Promise<{ items: AdminJob[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<{ items?: AdminJob[] }>(`/api/admin/jobs${q}`);
  return { items: data.items ?? [] };
}

export function adminRetryJob(jobId: string): Promise<AdminJob> {
  return apiFetch<AdminJob>(`/api/admin/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export function adminDeleteMedia(mediaId: string): Promise<void> {
  return apiFetch<void>(`/api/admin/media/${mediaId}`, { method: "DELETE" });
}

export function adminGrantHours(
  userId: string,
  hours: number,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/admin/users/${userId}/grant`, {
    method: "POST",
    body: JSON.stringify({ hours }),
  });
}

export function adminCosts(period: "day" | "month" = "day"): Promise<AdminCosts> {
  return apiFetch<AdminCosts>(`/api/admin/costs?period=${period}`);
}

type UploadOptions = {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  language?: string;
  speakersExpected?: number;
  vocabulary?: string;
  audioStreamIndex?: number;
  minutesTemplate?: string;
};

export type UploadMediaOptions = UploadOptions & {
  /** Zoom-style: several files → one meeting, each file a speaker (T-035b). */
  meetingBundle?: boolean;
};

/** POST /api/media — multipart stream with upload progress (XHR). */
export function uploadMedia(
  fileOrFiles: File | File[],
  options: UploadMediaOptions = {},
): Promise<MediaItem> {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  const bundle = Boolean(options.meetingBundle) && files.length >= 2;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.withCredentials = true;
    xhr.responseType = "json";

    const csrf = readCookie("dictably_csrf");
    if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf);

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as MediaItem);
        return;
      }
      reject(new ApiError(`${xhr.status} ${xhr.statusText}`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Network error", 0));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), {
        once: true,
      });
    }

    const body = new FormData();
    if (bundle) {
      for (const f of files) body.append("files", f);
      body.append("meeting_bundle", "1");
    } else {
      body.append("file", files[0]!);
    }
    if (options.language) body.append("language", options.language);
    if (!bundle && options.speakersExpected != null) {
      body.append("speakers_expected", String(options.speakersExpected));
    }
    if (options.vocabulary) body.append("vocabulary", options.vocabulary);
    if (!bundle && options.audioStreamIndex != null) {
      body.append("audio_stream_index", String(options.audioStreamIndex));
    }
    if (options.minutesTemplate) {
      body.append("minutes_template", options.minutesTemplate);
    }
    xhr.send(body);
  });
}
