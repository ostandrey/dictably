type TimecodeProps = {
  seconds: number;
  active?: boolean;
  onSeek?: (seconds: number) => void;
  "aria-label"?: string;
};

function formatTime(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function Timecode({
  seconds,
  active = false,
  onSeek,
  "aria-label": ariaLabel,
}: TimecodeProps) {
  const label = formatTime(seconds);
  return (
    <button
      type="button"
      className={`dy-timecode${active ? " is-active" : ""}`}
      aria-label={ariaLabel ?? `Seek to ${label}`}
      onClick={() => onSeek?.(seconds)}
    >
      <svg className="dy-icon" viewBox="0 0 12 12" aria-hidden>
        <path d="M3 2.5v7l6-3.5z" />
      </svg>
      <span className="dy-time">{label}</span>
    </button>
  );
}
