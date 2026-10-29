/** First-touch UTM / referrer for T-033 (sessionStorage until consent POST). */

const KEY = "dictably_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type Attribution = {
  signup_utm: Record<string, string>;
  signup_referrer: string | null;
};

function readStored(): Attribution | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

function writeStored(value: Attribution) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/** Capture from current URL once per tab; keep first-touch. */
export function captureAttributionFromLocation(): Attribution {
  const existing = readStored();
  if (existing && (Object.keys(existing.signup_utm).length || existing.signup_referrer)) {
    return existing;
  }

  const params = new URLSearchParams(window.location.search);
  const signup_utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key)?.trim();
    if (v) signup_utm[key] = v.slice(0, 128);
  }
  const ref = document.referrer?.trim() || "";
  let signup_referrer: string | null = null;
  if (ref && !ref.startsWith(window.location.origin)) {
    try {
      // Origin only — path/query can hold personal data (T-033 S3).
      signup_referrer = new URL(ref).origin;
    } catch {
      signup_referrer = null;
    }
  }

  const next: Attribution = { signup_utm, signup_referrer };
  if (Object.keys(signup_utm).length || signup_referrer) {
    writeStored(next);
  }
  return next;
}

export function peekAttribution(): Attribution {
  return (
    readStored() ?? {
      signup_utm: {},
      signup_referrer: null,
    }
  );
}
