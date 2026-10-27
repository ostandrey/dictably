import {
  demoMinutesEn,
  demoMinutesUk,
  demoTranscriptEn,
  demoTranscriptUk,
} from "@/lib/copy/demo-data";
import type { LandingCopy } from "@/lib/copy/types";

type Props = {
  copy: LandingCopy;
  compact?: boolean;
};

const TONE: Record<string, string> = {
  ochre: "var(--speaker-ochre)",
  teal: "var(--speaker-teal)",
  plum: "var(--speaker-plum)",
  olive: "var(--speaker-olive)",
  slate: "var(--speaker-slate)",
  rust: "var(--speaker-rust)",
};

export function InteractiveExample({ copy, compact = false }: Props) {
  const lines =
    copy.locale === "uk" ? demoTranscriptUk : demoTranscriptEn;
  const groups = copy.locale === "uk" ? demoMinutesUk : demoMinutesEn;
  const initial = lines[1] ?? lines[0];
  const pct = initial ? (initial.seconds / 840) * 100 : 0;
  /** Hero: minutes only (lighter LCP). Full section: both panels. */
  const showTranscript = !compact;

  return (
    <div
      className={`demo ${compact ? "demo--compact" : ""}`}
      data-demo
      data-duration="840"
    >
      <div className="demo__player">
        <div className="demo__wave" aria-hidden="true">
          <div className="demo__playhead" style={{ left: `${pct}%` }} />
        </div>
        <span className="demo__time font-mono" aria-live="polite">
          {initial?.time ?? "00:00"}
        </span>
      </div>

      <div className={`demo__grid${compact ? " demo__grid--single" : ""}`}>
        <section className="demo__panel" aria-label={copy.example.minutesLabel}>
          <h3 className="demo__panel-title">{copy.example.minutesLabel}</h3>
          <div className="demo__minutes">
            {groups.map((group) => (
              <div key={group.id} className="demo__group">
                <p className="demo__group-title">{group.title}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="demo__item"
                        data-seek={item.seconds}
                      >
                        <span className="demo__item-text">
                          {item.text}
                          {item.note ? (
                            <em className="demo__note"> ({item.note})</em>
                          ) : null}
                        </span>
                        <span className="demo__stamp font-mono">
                          {item.time}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {showTranscript ? (
          <section
            className="demo__panel"
            aria-label={copy.example.transcriptLabel}
          >
            <h3 className="demo__panel-title">{copy.example.transcriptLabel}</h3>
            <div className="demo__transcript">
              {lines.map((line) => {
                const active = line.id === initial?.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    data-line-id={line.id}
                    data-line-seconds={line.seconds}
                    data-seek={line.seconds}
                    className={`demo__line${active ? " is-active" : ""}`}
                  >
                    <span
                      className="demo__speaker-mark"
                      style={{ background: TONE[line.speakerTone] }}
                      aria-hidden
                    />
                    <span className="demo__line-meta">
                      <span className="demo__speaker">{line.speaker}</span>
                      <span className="demo__stamp font-mono">{line.time}</span>
                    </span>
                    <span className="demo__line-text">{line.text}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <p className="demo__hint">{copy.example.hint}</p>
    </div>
  );
}
