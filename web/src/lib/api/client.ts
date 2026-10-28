/**
 * Thin fetch wrapper for same-origin `/api/*` (nginx rewrite / next.dev proxy).
 * Types come from schema.d.ts (generated — do not edit by hand).
 */

import type { paths } from "./schema";

type HealthResponse =
  paths["/api/health"]["get"]["responses"]["200"]["content"]["application/json"];
type AuthConfig =
  paths["/api/auth/config"]["get"]["responses"]["200"]["content"]["application/json"];
type User =
  paths["/api/me"]["get"]["responses"]["200"]["content"]["application/json"];

export type { AuthConfig, User };

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
