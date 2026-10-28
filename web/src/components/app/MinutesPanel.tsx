"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getAnalysis,
  regenerateAnalysis,
  type Analysis,
} from "@/lib/api";

type Point = {
  text: string;
  segment_ids?: string[] | null;
  start_ms?: number | null;
  party_id?: string;
  due_text?: string | null;
  owner_speaker?: string | null;
};

type Props = {
  mediaId: string;
  title: string;
  emptyLabel: string;
  summaryLabel: string;
  decisionsLabel: string;
  deadlinesLabel: string;
  openQuestionsLabel: string;
  agreedToLabel: string;
  regenerateLabel: string;
  regeneratingLabel: string;
  limitLabel: string;
  errorLabel: string;
  className?: string;
  /** speaker label → { name, colorIdx, party } for meta + dots */
  speakerMeta?: Record<
    string,
    { name: string; colorIdx: number; party: string | null }
  >;
  onSeek: (startMs: number, segmentIds: string[]) => void;
};

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function Timecode({ start }: { start: number | null }) {
  if (start == null) return <span className="dy-timecode" aria-hidden />;
  return (
    <span className="dy-timecode">
      <svg className="dy-icon" viewBox="0 0 12 12" aria-hidden>
        <path d="M3 2.5v7l6-3.5z" />
      </svg>
      <span className="dy-time">{formatClock(start)}</span>
    </span>
  );
}

export function MinutesPanel({
  mediaId,
  title,
  emptyLabel,
  summaryLabel,
  decisionsLabel,
  deadlinesLabel,
  openQuestionsLabel,
  agreedToLabel,
  regenerateLabel,
  regeneratingLabel,
  limitLabel,
  errorLabel,
  className,
  speakerMeta = {},
  onSeek,
}: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const a = await getAnalysis(mediaId);
      setAnalysis(a);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setAnalysis(null);
      } else {
        setError(errorLabel);
      }
    } finally {
      setLoading(false);
    }
  }, [errorLabel, mediaId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function onRegenerate() {
    setBusy(true);
    setError(null);
    try {
      const a = await regenerateAnalysis(mediaId);
      setAnalysis(a);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(limitLabel);
      } else {
        setError(errorLabel);
      }
    } finally {
      setBusy(false);
    }
  }

  const result = analysis?.result;

  const partyColor = useMemo(() => {
    const map = new Map<string, number>();
    for (const sp of Object.values(speakerMeta)) {
      if (sp.party && !map.has(sp.party)) {
        map.set(sp.party, ((sp.colorIdx % 6) + 1) as number);
      }
    }
    result?.parties?.forEach((p, i) => {
      if (p?.id && !map.has(p.id)) {
        map.set(p.id, (i % 6) + 1);
      }
    });
    return map;
  }, [result?.parties, speakerMeta]);

  function ownerName(owner: string | null | undefined): string | null {
    if (!owner) return null;
    return speakerMeta[owner]?.name || owner;
  }

  function renderCheckItem(
    item: Point,
    key: string,
    withCheck: boolean,
  ) {
    const ids = (item.segment_ids ?? []).map(String);
    const start = item.start_ms ?? null;
    const owner = ownerName(item.owner_speaker);
    const metaBits = [owner, item.due_text].filter(Boolean);
    return (
      <button
        key={key}
        type="button"
        className={`dy-item${withCheck ? "" : " dy-item--plain"}`}
        data-minutes="item"
        data-start-ms={start ?? undefined}
        data-segs={ids.join(",")}
        onClick={() => {
          if (start == null) return;
          onSeek(start, ids);
        }}
      >
        {withCheck ? <span className="dy-item__check" aria-hidden /> : null}
        <div className="dy-item__body">
          <p className="dy-item__text">{item.text}</p>
          {metaBits.length ? (
            <span className="dy-item__meta">{metaBits.join(" · ")}</span>
          ) : null}
        </div>
        <Timecode start={start} />
      </button>
    );
  }

  function renderPlainGroup(heading: string, items: Point[] | undefined) {
    if (!items?.length) return null;
    return (
      <div className="dy-minutes__group">
        <h3 className="dy-minutes__heading">{heading}</h3>
        {items.map((item, i) => renderCheckItem(item, `${heading}-${i}`, false))}
      </div>
    );
  }

  const partyGroups = useMemo(() => {
    if (!result) return [] as { id: string; label: string; items: Point[]; tone: number }[];
    const parties = result.parties ?? [];
    const byParty = new Map<string, Point[]>();
    for (const a of (result.agreements ?? []) as Point[]) {
      const id = a.party_id || "_";
      const list = byParty.get(id) ?? [];
      list.push(a);
      byParty.set(id, list);
    }
    for (const t of (result.tasks ?? []) as Point[]) {
      const id = t.party_id || "_";
      const list = byParty.get(id) ?? [];
      list.push(t);
      byParty.set(id, list);
    }
    const orderedIds = [
      ...parties.map((p) => p.id),
      ...[...byParty.keys()].filter((id) => !parties.some((p) => p.id === id)),
    ];
    return orderedIds
      .filter((id) => (byParty.get(id) ?? []).length > 0)
      .map((id) => {
        const label =
          parties.find((p) => p.id === id)?.label?.trim() || id;
        return {
          id,
          label,
          items: byParty.get(id) ?? [],
          tone: partyColor.get(id) ?? 1,
        };
      });
  }, [partyColor, result]);

  const empty =
    !result ||
    !(
      result.summary?.length ||
      result.decisions?.length ||
      result.agreements?.length ||
      result.tasks?.length ||
      result.deadlines_and_facts?.length ||
      result.open_questions?.length
    );

  return (
    <aside className={className} data-recording="minutes">
      <div className="rec-page__minutes-head">
        <h2>{title}</h2>
        {(analysis?.regenerations_left ?? 0) > 0 ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void onRegenerate()}
            data-minutes="regenerate"
          >
            {busy ? regeneratingLabel : regenerateLabel}
          </button>
        ) : analysis ? (
          <span className="dy-muted" data-minutes="limit">
            {limitLabel}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="sign-in__error" role="alert" data-minutes="error">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="dy-muted">…</p>
      ) : empty ? (
        <p className="dy-muted" data-minutes="empty">
          {emptyLabel}
        </p>
      ) : (
        <div className="dy-minutes" data-minutes="body">
          {result?.summary?.length ? (
            <div className="dy-minutes__group" data-minutes="summary">
              <span className="dy-minutes__label">{summaryLabel}</span>
              {(result.summary as Point[]).map((p, i) => (
                <p key={`sum-${i}`} className="dy-minutes__summary">
                  {p.text}
                </p>
              ))}
            </div>
          ) : null}

          {partyGroups.map((g) => (
            <div key={g.id} className="dy-minutes__group" data-minutes="party">
              <h3 className="dy-minutes__heading">
                <span className={`dy-speaker__dot sp-${g.tone}`} aria-hidden />
                {agreedToLabel.replace("{label}", g.label)}
              </h3>
              {g.items.map((item, i) =>
                renderCheckItem(item, `${g.id}-${i}`, true),
              )}
            </div>
          ))}

          {renderPlainGroup(
            decisionsLabel,
            result?.decisions as Point[] | undefined,
          )}
          {renderPlainGroup(
            deadlinesLabel,
            result?.deadlines_and_facts as Point[] | undefined,
          )}
          {renderPlainGroup(
            openQuestionsLabel,
            result?.open_questions as Point[] | undefined,
          )}
        </div>
      )}
    </aside>
  );
}
