import {
  demoMinutesEn,
  demoMinutesUk,
  demoTranscriptEn,
  demoTranscriptUk,
} from "@/lib/copy/demo-data";
import type { LandingCopy, MinutesGroup, TranscriptLine } from "@/lib/copy/types";
import { WAVEFORM_PEAKS } from "@/lib/copy/waveform";
import { site } from "@/lib/site";

type Props = {
  copy: LandingCopy;
  variant?: "hero" | "full";
};

const TONE: Record<string, string> = {
  ochre: "var(--speaker-ochre)",
  teal: "var(--speaker-teal)",
  plum: "var(--speaker-plum)",
  olive: "var(--speaker-olive)",
  slate: "var(--speaker-slate)",
  rust: "var(--speaker-rust)",
};

/** B1: only lines/items that fit the hero stage (no scroll / hide). */
const HERO_LINE_IDS = ["t2", "t3", "t7"] as const;
const HERO_ITEM_IDS = new Set(["m2", "m1"]);

function heroLines(all: TranscriptLine[]): TranscriptLine[] {
  const map = new Map(all.map((l) => [l.id, l]));
  return HERO_LINE_IDS.map((id) => map.get(id)).filter(
    (l): l is TranscriptLine => Boolean(l),
  );
}

function heroGroups(all: MinutesGroup[]): MinutesGroup[] {
  const order = ["m2", "m1"] as const;
  return all
    .map((g) => {
      const byId = new Map(g.items.map((item) => [item.id, item]));
      return {
        ...g,
        items: order
          .map((id) => byId.get(id))
          .filter((item): item is NonNullable<typeof item> =>
            Boolean(item && HERO_ITEM_IDS.has(item.id)),
          ),
      };
    })
    .filter((g) => g.items.length > 0);
}

export function InteractiveExample({ copy, variant = "full" }: Props) {
  const isHero = variant === "hero";
  const allLines =
    copy.locale === "uk" ? demoTranscriptUk : demoTranscriptEn;
  const allGroups = copy.locale === "uk" ? demoMinutesUk : demoMinutesEn;
  const lines = isHero ? heroLines(allLines) : allLines;
  const groups = isHero ? heroGroups(allGroups) : allGroups;
  const initial = lines.find((l) => l.id === "t2") ?? lines[0];
  const pct = initial ? (initial.seconds / 840) * 100 : 0;

  return (
    <div
      className={`demo${isHero ? " demo--hero" : ""}`}
      data-demo
      data-demo-hero={isHero ? "true" : undefined}
      data-hero-autoplay={isHero && site.heroAutoplay ? "true" : undefined}
      data-duration="840"
      style={{ ["--play-pct" as string]: String(pct / 100) }}
    >
      <div className="demo__player">
        <div className="demo__wave" aria-hidden="true" data-demo-wave>
          <svg
            className="demo__wave-svg"
            viewBox={`0 0 ${WAVEFORM_PEAKS.length} 28`}
            preserveAspectRatio="none"
          >
            {WAVEFORM_PEAKS.map((peak, i) => {
              const h = Math.max(2, peak * 24);
              return (
                <rect
                  key={i}
                  className="demo__bar"
                  x={i + 0.15}
                  y={(28 - h) / 2}
                  width="0.7"
                  height={h}
                />
              );
            })}
          </svg>
          <div className="demo__playhead" data-demo-playhead />
        </div>
        <span
          className="demo__time font-mono"
          data-demo-time
          aria-live="off"
        >
          {initial?.time ?? "00:00"}
        </span>
      </div>

      <div className="demo__stage">
        <svg className="demo__link" aria-hidden="true" data-demo-link />
        <div className="demo__grid">
          <section
            className="demo__panel demo__panel--transcript"
            aria-label={copy.example.transcriptLabel}
          >
            <h3 className="demo__panel-title">
              {copy.example.transcriptLabel}
            </h3>
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
                    <span className="demo__line-text" data-line-text>
                      {line.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            className="demo__panel demo__panel--minutes"
            aria-label={copy.example.minutesLabel}
          >
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
                          data-item-id={item.id}
                          data-link-seconds={item.seconds}
                        >
                          <span
                            className="demo__item-skeleton"
                            aria-hidden="true"
                          />
                          <span className="demo__item-body">
                            <span className="demo__item-text">
                              {item.text}
                              {item.note ? (
                                <em className="demo__note"> ({item.note})</em>
                              ) : null}
                            </span>
                            <span className="demo__stamp font-mono">
                              {item.time}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <p className="demo__hint">{copy.example.hint}</p>
    </div>
  );
}
