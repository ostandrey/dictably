/** Read duration of a media File via HTMLMediaElement (T-040 quota gate). */
export function readFileDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio",
    );
    el.preload = "metadata";
    const done = (ms: number | null) => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      el.load();
      resolve(ms);
    };
    el.onloadedmetadata = () => {
      const sec = el.duration;
      if (!Number.isFinite(sec) || sec <= 0) done(null);
      else done(Math.round(sec * 1000));
    };
    el.onerror = () => done(null);
    window.setTimeout(() => done(null), 8_000);
    el.src = url;
  });
}

export function formatMinutesApprox(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

/** One balance format app-wide (T-045 N3 / D7): «2 h 55 min» / UK «2 год 55 хв». */
export function formatBalanceSeconds(
  seconds: number,
  opts?: { withLeft?: boolean; locale?: string },
): string {
  const uk = (opts?.locale ?? "en").startsWith("uk");
  const uH = uk ? "год" : "h";
  const uM = uk ? "хв" : "min";
  const left = opts?.withLeft ? (uk ? " залишилось" : " left") : "";
  if (seconds <= 0) return `0 ${uM}${left}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m} ${uM}${left}`;
  if (m <= 0) return `${h} ${uH}${left}`;
  return `${h} ${uH} ${m} ${uM}${left}`;
}
