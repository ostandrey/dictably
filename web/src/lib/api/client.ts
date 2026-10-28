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

export type { AuthConfig, User, MediaItem, MediaList, Transcript, Speaker, Analysis };

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

export function getPeaks(id: string): Promise<number[]> {
  return apiFetch<number[]>(`/api/media/${id}/peaks`);
}

export function getAnalysis(id: string): Promise<Analysis> {
  return apiFetch<Analysis>(`/api/media/${id}/analysis`);
}

export function regenerateAnalysis(id: string): Promise<Analysis> {
  return apiFetch<Analysis>(`/api/media/${id}/analysis`, { method: "POST" });
}

/** Cookie-authenticated audio URL for &lt;audio src&gt;. */
export function mediaAudioUrl(id: string): string {
  return `/api/media/${id}/audio`;
}

type UploadOptions = {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
};

/** POST /api/media — multipart stream with upload progress (XHR). */
export function uploadMedia(
  file: File,
  options: UploadOptions = {},
): Promise<MediaItem> {
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
    body.append("file", file);
    xhr.send(body);
  });
}
