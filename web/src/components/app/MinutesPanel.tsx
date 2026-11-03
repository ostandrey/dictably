"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ApiError,
  getAnalysis,
  regenerateAnalysis,
  type Analysis,
} from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

type Point = {
  text: string;
  segment_ids?: string[] | null;
  start_ms?: number | null;
  party_id?: string;
  due_text?: string | null;
  owner_speaker?: string | null;
  verify?: "supported" | "weak" | "not_supported" | null;
  verify_reason?: string | null;
  condition?: string | null;
  item_id?: string | null;
  agenda_ref?: string | null;
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
  /** Hide the regenerate control — parent ⋯ menu owns it (T-041). */
  hideRegenerate?: boolean;
  /** Notify parent of regen budget + current template for the recording menu. */
  onRegenMeta?: (meta: {
    left: number;
    busy: boolean;
    template: string;
  }) => void;
  /** External regenerate confirm open (from recording ⋯). */
  externalRegenOpen?: boolean;
  onExternalRegenClose?: () => void;
  /** External request to change template (mobile ⋯). */
  externalTemplatePick?: string | null;
  onExternalTemplateHandled?: () => void;
  /** Empty minutes → switch to transcript (T-045 S8). */
  onOpenTranscript?: () => void;
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
  hideRegenerate = false,
  onRegenMeta,
  externalRegenOpen = false,
  onExternalRegenClose,
  externalTemplatePick = null,
  onExternalTemplateHandled,
  onOpenTranscript,
}: Props) {
  const t = useTranslations("app");
  const verifyLabel = t("minutesVerify");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templateConfirm, setTemplateConfirm] = useState<string | null>(null);
  const [regenConfirm, setRegenConfirm] = useState(false);

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

  const result = analysis?.result;
  const serverTemplateRaw =
    (analysis as { template?: string } | null)?.template ||
    (result as { template?: string } | undefined)?.template ||
    "default";
  const serverTemplate =
    serverTemplateRaw === "official_protocol" ? "official_protocol" : "default";

  async function runRegenerate(nextTemplate: string) {
    setBusy(true);
    setError(null);
    try {
      const a = await regenerateAnalysis(mediaId, { template: nextTemplate });
      setAnalysis(a);
      setTemplateConfirm(null);
      closeRegenConfirm();
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

  useEffect(() => {
    onRegenMeta?.({
      left: analysis?.regenerations_left ?? 0,
      busy,
      template: serverTemplate,
    });
  }, [analysis?.regenerations_left, busy, onRegenMeta, serverTemplate]);

  const showRegenConfirm = regenConfirm || externalRegenOpen;

  function closeRegenConfirm() {
    setRegenConfirm(false);
    onExternalRegenClose?.();
  }

  useEffect(() => {
    if (!externalTemplatePick) return;
    const next = externalTemplatePick;
    const id = window.setTimeout(() => {
      if (next !== serverTemplate) setTemplateConfirm(next);
      onExternalTemplateHandled?.();
    }, 0);
    return () => window.clearTimeout(id);
  }, [externalTemplatePick, onExternalTemplateHandled, serverTemplate]);

  // Body layout follows last generated analysis, not the pending select value.
  const isOfficial = serverTemplate === "official_protocol";
  const agendaLabel = t("minutesAgenda");
  const heardLabel = t("minutesHeardOfficial");
  const adoptedLabel = t("minutesAdopted");
  const tasksOfficialLabel = t("minutesTasksOfficial");
  const otherLabel = t("minutesOther");
  const attendeesLabel = t("minutesAttendees");
  const templateLabel = t("minutesTemplate");
  const templateMinutes = t("minutesTemplateDefault");
  const templateOfficial = t("minutesTemplateOfficial");

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
    const metaBits = [owner, item.due_text, item.condition].filter(Boolean);
    const weak = item.verify === "weak";
    return (
      <button
        key={key}
        type="button"
        className={`dy-item${withCheck ? "" : " dy-item--plain"}${weak ? " dy-item--weak" : ""}`}
        data-minutes="item"
        data-verify={item.verify ?? undefined}
        data-start-ms={start ?? undefined}
        data-segs={ids.join(",")}
        title={weak ? (item.verify_reason || verifyLabel) : undefined}
        onClick={() => {
          if (start == null) return;
          onSeek(start, ids);
        }}
      >
        {withCheck ? <span className="dy-item__check" aria-hidden /> : null}
        <div className="dy-item__body">
          <p className="dy-item__text">
            {item.text}
            {weak ? (
              <span
                className="dy-item__weak"
                data-minutes="weak"
                title={item.verify_reason || verifyLabel}
              >
                {verifyLabel}
              </span>
            ) : null}
          </p>
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
    if (!result || isOfficial)
      return [] as { id: string; label: string; items: Point[]; tone: number }[];
    const parties = result.parties ?? [];
    const byParty = new Map<string, Point[]>();
    for (const a of (result.agreements ?? []) as Point[]) {
      const id = a.party_id || "_";
      const list = byParty.get(id) ?? [];
      list.push(a);
      byParty.set(id, list);
    }
    for (const task of (result.tasks ?? []) as Point[]) {
      const id = task.party_id || "_";
      const list = byParty.get(id) ?? [];
      list.push(task);
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
  }, [isOfficial, partyColor, result]);

  const agendaBuckets = useMemo(() => {
    if (!result || !isOfficial) {
      return [] as {
        key: string;
        heading: string;
        heard: Point[];
        decisions: Point[];
        tasks: Point[];
      }[];
    }
    const agenda = ((result as { agenda?: Point[] }).agenda ?? []) as Point[];
    const index = new Map<string, number>();
    agenda.forEach((a, i) => {
      if (a.item_id) index.set(String(a.item_id), i);
      index.set(String(i + 1), i);
      index.set(`A${i + 1}`, i);
    });
    type Bucket = {
      key: string;
      heading: string;
      heard: Point[];
      decisions: Point[];
      tasks: Point[];
    };
    const buckets: Bucket[] = agenda.map((a, i) => ({
      key: a.item_id || `A${i + 1}`,
      heading: `${i + 1}. ${a.text}`,
      heard: [],
      decisions: [],
      tasks: [],
    }));
    const other: Bucket = {
      key: "other",
      heading: otherLabel,
      heard: [],
      decisions: [],
      tasks: [],
    };
    function place(ref: string | null | undefined, kind: "heard" | "decisions" | "tasks", item: Point) {
      const idx = ref ? index.get(String(ref)) : undefined;
      const target =
        idx != null && idx >= 0 && idx < buckets.length ? buckets[idx]! : other;
      target[kind].push(item);
    }
    for (const h of ((result as { heard?: Point[] }).heard ?? []) as Point[]) {
      place(h.agenda_ref, "heard", h);
    }
    for (const d of (result.decisions ?? []) as Point[]) {
      place(d.agenda_ref, "decisions", d);
    }
    for (const task of (result.tasks ?? []) as Point[]) {
      place(task.agenda_ref, "tasks", task);
    }
    const out = buckets.filter(
      (b) => b.heard.length || b.decisions.length || b.tasks.length,
    );
    if (other.heard.length || other.decisions.length || other.tasks.length) {
      out.push(other);
    }
    return out;
  }, [isOfficial, otherLabel, result]);

  const attendeeNames = useMemo(() => {
    if (!isOfficial || !result) return [] as string[];
    const fromSpeakers = Object.values(speakerMeta)
      .map((s) => s.name)
      .filter(Boolean);
    if (fromSpeakers.length) return fromSpeakers;
    return (
      ((result as { participants?: { suggested_name?: string; speaker?: string }[] })
        .participants ?? [])
        .map((p) => p.suggested_name || p.speaker || "")
        .filter(Boolean) as string[]
    );
  }, [isOfficial, result, speakerMeta]);

  const empty =
    !result ||
    !(
      result.summary?.length ||
      (result as { agenda?: unknown[] }).agenda?.length ||
      (result as { heard?: unknown[] }).heard?.length ||
      result.decisions?.length ||
      result.agreements?.length ||
      result.tasks?.length ||
      result.deadlines_and_facts?.length ||
      result.open_questions?.length
    );

  const left = analysis?.regenerations_left ?? 0;
  const pendingTemplateLabel =
    templateConfirm === "official_protocol" ? templateOfficial : templateMinutes;

  return (
    <aside className={className} data-recording="minutes">
      <div className="rec-page__minutes-head">
        <h2>{title}</h2>
        <label className="rec-page__minutes-template">
          <span className="visually-hidden">{templateLabel}</span>
          <select
            value={serverTemplate}
            data-minutes="template"
            disabled={busy || left <= 0}
            onChange={(e) => {
              const next = e.target.value;
              if (next === serverTemplate) return;
              // Reset select to server value until confirm (T-041: no silent regen).
              e.target.value = serverTemplate;
              setTemplateConfirm(next);
            }}
          >
            <option value="default">{templateMinutes}</option>
            <option value="official_protocol">{templateOfficial}</option>
          </select>
        </label>
        {!hideRegenerate && left > 0 ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setRegenConfirm(true)}
            data-minutes="regenerate"
          >
            {busy ? regeneratingLabel : regenerateLabel}
          </button>
        ) : !hideRegenerate && analysis ? (
          <span className="dy-muted" data-minutes="limit">
            {limitLabel}
          </span>
        ) : null}
      </div>
      <Dialog
        open={templateConfirm != null}
        title={t("templateConfirmTitle")}
        onClose={() => setTemplateConfirm(null)}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setTemplateConfirm(null)}
              data-minutes="template-cancel"
            >
              {t("cancel")}
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                if (templateConfirm) void runRegenerate(templateConfirm);
              }}
              data-minutes="template-confirm"
            >
              {t("templateConfirmAction")}
            </Button>
          </>
        }
      >
        <p>
          {t("templateConfirmBody", {
            template: pendingTemplateLabel,
            left: String(Math.max(0, left)),
          })}
        </p>
      </Dialog>
      <Dialog
        open={showRegenConfirm}
        title={t("regenConfirmTitle")}
        onClose={closeRegenConfirm}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={closeRegenConfirm}
              data-minutes="regen-cancel"
            >
              {t("cancel")}
            </Button>
            <Button
              loading={busy}
              onClick={() => void runRegenerate(serverTemplate)}
              data-minutes="regenerate"
            >
              {t("regenConfirmAction")}
            </Button>
          </>
        }
      >
        <p>
          {t("regenConfirmBody", {
            left: String(Math.max(0, left - 1)),
          })}
        </p>
      </Dialog>
      {error ? (
        <div data-minutes="error-wrap">
          <p className="sign-in__error" role="alert" data-minutes="error">
            {error}
          </p>
          <button
            type="button"
            className="btn-secondary"
            data-minutes="retry"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {t("retry")}
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="dy-muted">…</p>
      ) : empty ? (
        <div className="dy-muted" data-minutes="empty">
          <p data-minutes="empty-explain">{t("minutesEmptyExplain")}</p>
          <div className="dy-minutes__empty-actions" data-minutes="empty-actions">
            {onOpenTranscript ? (
              <button
                type="button"
                className="btn-secondary"
                data-minutes="empty-transcript"
                onClick={onOpenTranscript}
              >
                {t("minutesEmptyOpenTranscript")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              data-minutes="empty-regenerate"
              disabled={busy || (analysis?.regenerations_left ?? 0) <= 0}
              onClick={() => setRegenConfirm(true)}
            >
              {regenerateLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="dy-minutes" data-minutes="body" data-template={serverTemplate}>
          {isOfficial ? (
            <>
              {attendeeNames.length ? (
                <p className="dy-minutes__attendees" data-minutes="attendees">
                  <strong>{attendeesLabel}:</strong> {attendeeNames.join(", ")}
                </p>
              ) : null}
              {((result as { agenda?: Point[] } | undefined)?.agenda ?? []).length ? (
                <div className="dy-minutes__group" data-minutes="agenda">
                  <h3 className="dy-minutes__heading">{agendaLabel}</h3>
                  <ol className="dy-minutes__agenda">
                    {((result as { agenda?: Point[] }).agenda ?? []).map((a, i) => (
                      <li key={a.item_id || `ag-${i}`}>{a.text}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {agendaBuckets.map((b) => (
                <div
                  key={b.key}
                  className="dy-minutes__group"
                  data-minutes="agenda-topic"
                >
                  <h3 className="dy-minutes__heading">{b.heading}</h3>
                  {b.heard.length ? (
                    <>
                      <span className="dy-minutes__label">{heardLabel}</span>
                      {b.heard.map((item, i) =>
                        renderCheckItem(item, `${b.key}-h-${i}`, false),
                      )}
                    </>
                  ) : null}
                  {b.decisions.length ? (
                    <>
                      <span className="dy-minutes__label">{adoptedLabel}</span>
                      {b.decisions.map((item, i) =>
                        renderCheckItem(item, `${b.key}-d-${i}`, false),
                      )}
                    </>
                  ) : null}
                  {b.tasks.length ? (
                    <>
                      <span className="dy-minutes__label">{tasksOfficialLabel}</span>
                      {b.tasks.map((item, i) =>
                        renderCheckItem(item, `${b.key}-t-${i}`, true),
                      )}
                    </>
                  ) : null}
                </div>
              ))}
              {renderPlainGroup(
                openQuestionsLabel,
                result?.open_questions as Point[] | undefined,
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </aside>
  );
}
