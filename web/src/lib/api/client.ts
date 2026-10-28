/**
 * Thin fetch wrapper for same-origin `/api/*` (nginx rewrite / next.dev proxy).
 * Types come from schema.d.ts (generated — do not edit by hand).
 */

import type { paths } from "./schema";

type HealthResponse =
  paths["/api/health"]["get"]["responses"]["200"]["content"]["application/json"];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

/** GET /api/health — smoke check that the proxy reaches the backend. */
export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}
