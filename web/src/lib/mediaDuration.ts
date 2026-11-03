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

/** One balance format app-wide (T-045 N3 / D7): «2 h 55 min». */
export function formatBalanceSeconds(
  seconds: number,
  opts?: { withLeft?: boolean },
): string {
  const left = opts?.withLeft ? " left" : "";
  if (seconds <= 0) return `0 min${left}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m} min${left}`;
  if (m <= 0) return `${h} h${left}`;
  return `${h} h ${m} min${left}`;
}
