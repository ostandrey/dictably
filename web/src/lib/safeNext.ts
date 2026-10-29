/** Mirror backend sanitize_next_path — internal /app|/admin only (T-037). */
const SAFE_PATH =
  /^\/(?:uk\/)?(?:app(?:\/[\w./-]*)?|admin\/?)$/;
const SAFE_QUERY = /^[\w%=&.,+-]+$/;

export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback = "/app/",
): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("://") || raw.includes("..") || raw.includes("\\")) {
    return fallback;
  }
  const q = raw.indexOf("?");
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q + 1) : "";
  if (!SAFE_PATH.test(path)) return fallback;
  if (query && !SAFE_QUERY.test(query)) return fallback;
  return query ? `${path}?${query}` : path;
}

export function currentAppNext(fallback = "/app/"): string {
  if (typeof window === "undefined") return fallback;
  return sanitizeNextPath(
    `${window.location.pathname}${window.location.search}`,
    fallback,
  );
}
