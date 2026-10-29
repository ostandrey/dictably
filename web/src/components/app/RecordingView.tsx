"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ApiError,
  downloadMediaExport,
  fetchMinutesMarkdown,
  getMedia,
  getPeaks,
  getTranscript,
  mediaAudioUrl,
  patchSpeaker,
  type ExportFormat,
  type ExportKind,
  type MediaItem,
  type Speaker,
  type Transcript,
} from "@/lib/api";
import { Alert, Button } from "@/components/ui";
import { MinutesPanel } from "./MinutesPanel";

type Word = {
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id?: string | null;
};

type Props = {
  mediaId: string;
  locale: "en" | "uk";
  recordingsHref: string;
  recordingsLabel: string;
  renameLabel: string;
  findPlaceholder: string;
  ourLabel: string;
  theirLabel: string;
  saveLabel: string;
  cancelLabel: string;
  errorLabel: string;
  backToNowLabel: string;
  matchCountLabel: string;
  transcriptTab: string;
  minutesTab: string;
  minutesEmpty: string;
  summaryLabel: string;
  decisionsLabel: string;
  deadlinesLabel: string;
  openQuestionsLabel: string;
  agreedToLabel: string;
  regenerateLabel: string;
  regeneratingLabel: string;
  regenerateLimitLabel: string;
  exportLabel: string;
  exportMenuLabel: string;
  exportMinutesDocx: string;
  exportMinutesPdf: string;
  exportMinutesCopy: string;
  exportMinutesCopied: string;
  exportTranscriptTxt: string;
  exportTranscriptDocx: string;
  exportTranscriptSrt: string;
  exportTranscriptVtt: string;
  exportFailed: string;
};

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDateTime(iso: string, locale: "en" | "uk"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")}, ${get("hour")}:${get("minute")}`;
}

function speakerName(speakers: Speaker[], label: string | null | undefined): string {
  if (!label) return "Speaker";
  const sp = speakers.find((s) => s.label === label);
  return sp?.display_name?.trim() || sp?.label || label;
}

function speakerTone(speakers: Speaker[], label: string | null | undefined): number {
  const sp = speakers.find((s) => s.label === label);
  return ((sp?.color_idx ?? 0) % 6) + 1;
}

function highlightPlain(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const i = lower.indexOf(needle);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="rec-hit">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

function resamplePeaks(peaks: number[], count: number): number[] {
  if (count <= 0) return [];
  if (!peaks.length) {
    return Array.from({ length: count }, (_, i) => 0.25 + ((i * 17) % 10) / 25);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i / count) * peaks.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / count) * peaks.length));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, Math.abs(peaks[j] ?? 0));
    out.push(max);
  }
  return out;
}

type Lane = { tone: number; start: number; end: number };

function buildLanes(
  segments: { speaker_id?: string | null; start_ms: number; end_ms: number }[],
  speakers: Speaker[],
  durationMs: number,
): Lane[] {
  if (!segments.length || durationMs <= 0) return [];
  const lanes: Lane[] = [];
  for (const seg of segments) {
    const tone = speakerTone(speakers, seg.speaker_id);
    const start = Math.max(0, seg.start_ms) / durationMs;
    const end = Math.min(durationMs, Math.max(seg.end_ms, seg.start_ms + 1)) / durationMs;
    const last = lanes[lanes.length - 1];
    if (last && last.tone === tone && Math.abs(last.end - start) < 0.002) {
      last.end = end;
    } else {
      lanes.push({ tone, start, end });
    }
  }
  return lanes;
}

export function RecordingView({
  mediaId,
  locale,
  recordingsHref,
  recordingsLabel,
  renameLabel,
  findPlaceholder,
  ourLabel,
  theirLabel,
  saveLabel,
  cancelLabel,
  errorLabel,
  backToNowLabel,
  matchCountLabel,
  transcriptTab,
  minutesTab,
  minutesEmpty,
  summaryLabel,
  decisionsLabel,
  deadlinesLabel,
  openQuestionsLabel,
  agreedToLabel,
  regenerateLabel,
  regeneratingLabel,
  regenerateLimitLabel,
  exportLabel,
  exportMenuLabel,
  exportMinutesDocx,
  exportMinutesPdf,
  exportMinutesCopy,
  exportMinutesCopied,
  exportTranscriptTxt,
  exportTranscriptDocx,
  exportTranscriptSrt,
  exportTranscriptVtt,
  exportFailed,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const ignoreScrollRef = useRef(false);

  const [media, setMedia] = useState<MediaItem | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [mobileTab, setMobileTab] = useState<"transcript" | "minutes">("transcript");
  const [waveWidth, setWaveWidth] = useState(320);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftParty, setDraftParty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [evidenceSegIds, setEvidenceSegIds] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, t, p] = await Promise.all([
        getMedia(mediaId),
        getTranscript(mediaId),
        getPeaks(mediaId).catch(() => [] as number[]),
      ]);
      setMedia(m);
      setTranscript(t);
      setPeaks(Array.isArray(p) ? p : []);
      const names: Record<string, string> = {};
      const parties: Record<string, string> = {};
      for (const sp of t.speakers ?? []) {
        names[sp.id] = sp.display_name || sp.label;
        parties[sp.id] = sp.party || "";
      }
      setDraftNames(names);
      setDraftParty(parties);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = recordingsHref;
        return;
      }
      setError(errorLabel);
    }
  }, [errorLabel, mediaId, recordingsHref]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentSec(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [mediaId, media]);

  useLayoutEffect(() => {
    const el = waveRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWaveWidth(w);
    });
    ro.observe(el);
    setWaveWidth(el.clientWidth || 320);
    return () => ro.disconnect();
  }, [media]);

  const speakers = useMemo(() => transcript?.speakers ?? [], [transcript]);
  const segments = useMemo(() => transcript?.segments ?? [], [transcript]);
  const words = useMemo(
    () => (transcript?.words ?? []) as Word[],
    [transcript],
  );
  const durationSec = (media?.duration_ms ?? 0) / 1000 || 1;
  const durationMs = durationSec * 1000;
  const progress = Math.min(1, currentSec / durationSec);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as string[];
    return segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.id);
  }, [query, segments]);

  useEffect(() => {
    setMatchIdx(0);
  }, [query]);

  const activeSegIndex = useMemo(() => {
    const ms = currentSec * 1000;
    let best = 0;
    for (let i = 0; i < segments.length; i++) {
      if ((segments[i]?.start_ms ?? 0) <= ms) best = i;
      else break;
    }
    return best;
  }, [currentSec, segments]);

  const activeSegId = segments[activeSegIndex]?.id ?? null;

  const activeWordIndex = useMemo(() => {
    if (!words.length) return -1;
    const ms = currentSec * 1000;
    let best = -1;
    for (let i = 0; i < words.length; i++) {
      if ((words[i]?.start_ms ?? 0) <= ms) best = i;
      else break;
    }
    return best;
  }, [currentSec, words]);

  const wordsBySeg = useMemo(() => {
    const map = new Map<string, Word[]>();
    if (!words.length || !segments.length) return map;
    for (const w of words) {
      const mid = (w.start_ms + w.end_ms) / 2;
      let owner = segments[0]!;
      for (const s of segments) {
        if (s.start_ms <= mid) owner = s;
        else break;
      }
      const list = map.get(owner.id) ?? [];
      list.push(w);
      map.set(owner.id, list);
    }
    return map;
  }, [segments, words]);

  const barCount = Math.max(24, Math.floor(waveWidth / 5));
  const bars = useMemo(
    () => resamplePeaks(peaks, barCount),
    [peaks, barCount],
  );
  const lanes = useMemo(
    () => buildLanes(segments, speakers, durationMs),
    [segments, speakers, durationMs],
  );

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 10,
  });

  const scrollToSegIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      if (index < 0 || index >= segments.length) return;
      ignoreScrollRef.current = true;
      virtualizer.scrollToIndex(index, { align: "center", behavior });
      window.setTimeout(() => {
        ignoreScrollRef.current = false;
      }, 400);
    },
    [segments.length, virtualizer],
  );

  useEffect(() => {
    followRef.current = followPlayback;
  }, [followPlayback]);

  useEffect(() => {
    if (!followPlayback || !playing) return;
    scrollToSegIndex(activeSegIndex, "smooth");
  }, [activeSegIndex, followPlayback, playing, scrollToSegIndex]);

  useEffect(() => {
    if (!matchIds.length) return;
    const id = matchIds[Math.min(matchIdx, matchIds.length - 1)];
    const index = segments.findIndex((s) => s.id === id);
    if (index >= 0) scrollToSegIndex(index, "smooth");
  }, [matchIdx, matchIds, scrollToSegIndex, segments]);

  function pauseFollow() {
    if (ignoreScrollRef.current) return;
    if (followRef.current) {
      followRef.current = false;
      setFollowPlayback(false);
    }
  }

  function resumeFollow() {
    setFollowPlayback(true);
    followRef.current = true;
    scrollToSegIndex(activeSegIndex, "smooth");
  }

  function seekTo(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.dataset.seekMs = String(Math.round(ms));
    audio.currentTime = ms / 1000;
    void audio.play();
    setCurrentSec(ms / 1000);
  }

  function goMatch(delta: number) {
    if (!matchIds.length) return;
    setMatchIdx((i) => {
      const next = (i + delta + matchIds.length) % matchIds.length;
      return next;
    });
    setFollowPlayback(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inFind =
        (e.target as HTMLElement | null)?.getAttribute?.("data-recording") ===
        "find";
      if (inFind && (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        if (e.key === "Enter") goMatch(e.shiftKey ? -1 : 1);
        else if (e.key === "ArrowDown") goMatch(1);
        else goMatch(-1);
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const audio = audioRef.current;
      if (!audio) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (audio.paused) void audio.play();
        else audio.pause();
      } else if (e.key === "j" || e.key === "J") {
        audio.currentTime = Math.max(0, audio.currentTime - 5);
      } else if (e.key === "l" || e.key === "L") {
        audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + 5);
      } else if (e.key === "k" || e.key === "K") {
        audio.pause();
      } else if (e.key === ",") {
        const next = Math.max(0.5, Math.round((rate - 0.25) * 100) / 100);
        setRate(next);
        audio.playbackRate = next;
      } else if (e.key === ".") {
        const next = Math.min(2, Math.round((rate + 0.25) * 100) / 100);
        setRate(next);
        audio.playbackRate = next;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goMatch closes over matchIds
  }, [rate, matchIds.length]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function cycleRate() {
    const steps = [1, 1.25, 1.5, 0.75];
    const i = steps.indexOf(rate);
    const next = steps[(i + 1) % steps.length] ?? 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  async function saveRename() {
    if (!transcript) return;
    setSaving(true);
    setError(null);
    try {
      for (const sp of speakers) {
        await patchSpeaker(mediaId, sp.id, {
          display_name: draftNames[sp.id] ?? sp.display_name,
          party: draftParty[sp.id] || null,
        });
      }
      await load();
      setRenameOpen(false);
    } catch {
      setError(errorLabel);
    } finally {
      setSaving(false);
    }
  }

  function renderSegText(segId: string, text: string): ReactNode {
    const segWords = wordsBySeg.get(segId);
    const q = query.trim();
    if (!segWords?.length) return highlightPlain(text, q);
    return segWords.map((w, i) => {
      const globalIdx = words.indexOf(w);
      const isNow = globalIdx === activeWordIndex;
      const hit =
        q && w.text.toLowerCase().includes(q.toLowerCase()) ? " rec-hit" : "";
      return (
        <span
          key={`${segId}-w-${i}`}
          className={`rec-word${isNow ? " is-now" : ""}${hit}`}
          data-recording="word"
        >
          {w.text}
          {i < segWords.length - 1 ? " " : ""}
        </span>
      );
    });
  }

  useEffect(() => {
    if (!exportOpen) return;
    function onDoc(e: Event) {
      const t = e.target as Node | null;
      if (exportMenuRef.current && t && !exportMenuRef.current.contains(t)) {
        setExportOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  async function runExport(kind: ExportKind, format: ExportFormat) {
    setExportBusy(true);
    setError(null);
    try {
      await downloadMediaExport(mediaId, kind, format);
      setExportOpen(false);
    } catch {
      setError(exportFailed);
    } finally {
      setExportBusy(false);
    }
  }

  async function copyMinutes() {
    setExportBusy(true);
    setError(null);
    try {
      const md = await fetchMinutesMarkdown(mediaId);
      await navigator.clipboard.writeText(md);
      setCopiedFlash(true);
      window.setTimeout(() => setCopiedFlash(false), 1600);
      setExportOpen(false);
    } catch {
      setError(exportFailed);
    } finally {
      setExportBusy(false);
    }
  }

  if (error && !media) {
    return (
      <Alert tone="danger" data-recording="error">
        {error}
      </Alert>
    );
  }

  if (!media || !transcript) {
    return <p className="dy-muted">Loading…</p>;
  }

  const matchLabel = matchIds.length
    ? matchCountLabel
        .replace("{current}", String(matchIdx + 1))
        .replace("{total}", String(matchIds.length))
    : "";

  function seekWave(e: MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * durationMs);
  }

  return (
    <div className="rec-page" data-recording="page">
      <header className="rec-page__crumb">
        <div className="rec-page__crumb-path">
          <a href={recordingsHref}>{recordingsLabel}</a>
          <span aria-hidden>/</span>
          <span>{media.filename}</span>
        </div>
        <div className="rec-page__export" ref={exportMenuRef}>
          <button
            type="button"
            className="btn-text"
            data-recording="export"
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            aria-label={exportMenuLabel}
            disabled={exportBusy}
            onClick={() => setExportOpen((v) => !v)}
          >
            {exportLabel}
          </button>
          {exportOpen ? (
            <div className="rec-page__export-pop" role="menu" data-recording="export-menu">
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="minutes-docx"
                disabled={exportBusy}
                onClick={() => void runExport("minutes", "docx")}
              >
                {exportMinutesDocx}
              </button>
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="minutes-pdf"
                disabled={exportBusy}
                onClick={() => void runExport("minutes", "pdf")}
              >
                {exportMinutesPdf}
              </button>
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="minutes-copy"
                disabled={exportBusy}
                onClick={() => void copyMinutes()}
              >
                {copiedFlash ? exportMinutesCopied : exportMinutesCopy}
              </button>
              <div className="rec-page__export-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="transcript-txt"
                disabled={exportBusy}
                onClick={() => void runExport("transcript", "txt")}
              >
                {exportTranscriptTxt}
              </button>
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="transcript-docx"
                disabled={exportBusy}
                onClick={() => void runExport("transcript", "docx")}
              >
                {exportTranscriptDocx}
              </button>
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="transcript-srt"
                disabled={exportBusy}
                onClick={() => void runExport("transcript", "srt")}
              >
                {exportTranscriptSrt}
              </button>
              <button
                type="button"
                role="menuitem"
                className="rec-page__export-item"
                data-export="transcript-vtt"
                disabled={exportBusy}
                onClick={() => void runExport("transcript", "vtt")}
              >
                {exportTranscriptVtt}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section className="rec-page__hero" data-recording="player-band">
        <div className="rec-page__title-row">
          <div>
            <h1 className="rec-page__title">{media.filename}</h1>
            <p className="rec-page__meta dy-time" data-recording="meta">
              {[
                formatDateTime(media.created_at, locale),
                formatClock(durationSec),
                media.language || transcript.language || "—",
              ].join(" · ")}
            </p>
          </div>
          <div className="rec-page__speakers">
            {speakers.map((sp) => (
              <span key={sp.id} className="dy-speaker">
                <span
                  className={`dy-speaker__dot sp-${(sp.color_idx % 6) + 1}`}
                  aria-hidden
                />
                {sp.display_name || sp.label}
                {sp.party ? (
                  <span className="dy-speaker__role">
                    {sp.party === "our" ? ourLabel : theirLabel}
                  </span>
                ) : null}
              </span>
            ))}
            <button
              type="button"
              className="btn-text"
              data-recording="rename"
              onClick={() => setRenameOpen(true)}
            >
              {renameLabel}
            </button>
          </div>
        </div>
        <div className="dy-player rec-page__player" data-recording="player">
          <button
            type="button"
            className="dy-play"
            aria-label={playing ? "Pause" : "Play"}
            data-recording="play"
            onClick={togglePlay}
          >
            {playing ? (
              <svg className="dy-icon" viewBox="0 0 16 16" aria-hidden>
                <rect x="4" y="3" width="3" height="10" rx="1" />
                <rect x="9" y="3" width="3" height="10" rx="1" />
              </svg>
            ) : (
              <svg className="dy-icon" viewBox="0 0 16 16" aria-hidden>
                <path d="M4.5 2.8v10.4L13 8z" />
              </svg>
            )}
          </button>
          <div className="dy-wave" ref={waveRef} data-recording="wave">
            <div className="dy-wave__bars" aria-hidden onClick={seekWave}>
              {bars.map((v, i) => {
                const played = i / bars.length < progress;
                const h = 8 + Math.min(24, Math.abs(v) * 28);
                return (
                  <span
                    key={i}
                    className={`dy-wave__bar${played ? " is-played" : ""}`}
                    style={{ height: h }}
                  />
                );
              })}
              <span
                className="dy-wave__playhead"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
            <div
              className="dy-wave__lanes"
              aria-hidden
              data-recording="speaker-lane"
              onClick={seekWave}
            >
              {lanes.map((lane, i) => (
                <span
                  key={i}
                  className={`dy-wave__lane sp-${lane.tone}`}
                  style={{
                    left: `${lane.start * 100}%`,
                    width: `${Math.max(0.15, (lane.end - lane.start) * 100)}%`,
                  }}
                />
              ))}
            </div>
          </div>
          <span className="dy-player__time" data-recording="time">
            <b>{formatClock(currentSec)}</b> / {formatClock(durationSec)}
          </span>
          <button type="button" className="btn-text" data-recording="rate" onClick={cycleRate}>
            {rate}×
          </button>
        </div>
        <audio
          ref={audioRef}
          src={mediaAudioUrl(mediaId)}
          preload="metadata"
          data-recording="audio"
        />
      </section>

      {error ? (
        <Alert tone="danger" data-recording="error">
          {error}
        </Alert>
      ) : null}

      <div className="rec-page__tabs dy-tabs" role="tablist" aria-label="Recording">
        <button
          type="button"
          role="tab"
          className="dy-tab"
          aria-selected={mobileTab === "transcript"}
          onClick={() => setMobileTab("transcript")}
        >
          {transcriptTab}
        </button>
        <button
          type="button"
          role="tab"
          className="dy-tab"
          aria-selected={mobileTab === "minutes"}
          onClick={() => setMobileTab("minutes")}
        >
          {minutesTab}
        </button>
      </div>

      <section className="rec-page__body">
        <div
          className={`rec-page__transcript${mobileTab === "transcript" ? " is-open" : ""}`}
          data-recording="transcript"
        >
          <div className="rec-page__transcript-head">
            <h2>{transcriptTab}</h2>
            <div className="rec-page__find">
              <label className="app-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l4 4" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={findPlaceholder}
                  aria-label={findPlaceholder}
                  data-recording="find"
                />
              </label>
              {matchIds.length ? (
                <div className="rec-page__match" data-recording="match-nav">
                  <span data-recording="match-count">{matchLabel}</span>
                  <button
                    type="button"
                    className="btn-text"
                    aria-label="Previous match"
                    data-recording="match-prev"
                    onClick={() => goMatch(-1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    aria-label="Next match"
                    data-recording="match-next"
                    onClick={() => goMatch(1)}
                  >
                    ↓
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rec-page__scroll-wrap">
            <div
              ref={scrollRef}
              className="rec-page__scroll"
              data-recording="transcript-scroll"
              onScroll={pauseFollow}
              onWheel={pauseFollow}
              onTouchMove={pauseFollow}
            >
              <div
                className="dy-transcript rec-page__virtual"
                style={{ height: virtualizer.getTotalSize(), position: "relative" }}
              >
                {virtualizer.getVirtualItems().map((row) => {
                  const seg = segments[row.index]!;
                  const active = seg.id === activeSegId;
                  const isMatch = matchIds.includes(seg.id);
                  const isCurrentMatch =
                    matchIds[matchIdx] === seg.id && matchIds.length > 0;
                  const isEvidence = evidenceSegIds.includes(seg.id);
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      className={`dy-turn${active ? " is-playing" : ""}${isMatch ? " is-match" : ""}${isCurrentMatch ? " is-match-current" : ""}${isEvidence ? " is-evidence" : ""}`}
                      data-recording="segment"
                      data-seg-id={seg.id}
                      data-start-ms={seg.start_ms}
                      data-index={row.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${row.start}px)`,
                      }}
                      ref={virtualizer.measureElement}
                      onClick={() => {
                        pauseFollow();
                        setEvidenceSegIds([]);
                        seekTo(seg.start_ms);
                      }}
                    >
                      <span className="dy-speaker">
                        <span
                          className={`dy-speaker__dot sp-${speakerTone(speakers, seg.speaker_id)}`}
                          aria-hidden
                        />
                        {speakerName(speakers, seg.speaker_id)}
                      </span>
                      <span className={`dy-timecode${active ? " is-active" : ""}`}>
                        <svg className="dy-icon" viewBox="0 0 12 12" aria-hidden>
                          <path d="M3 2.5v7l6-3.5z" />
                        </svg>
                        <span className="dy-time">
                          {formatClock(seg.start_ms / 1000)}
                        </span>
                      </span>
                      <p className="dy-turn__text">{renderSegText(seg.id, seg.text)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            {!followPlayback ? (
              <button
                type="button"
                className="rec-page__back-now btn-secondary"
                data-recording="back-to-now"
                onClick={resumeFollow}
              >
                {backToNowLabel}
              </button>
            ) : null}
          </div>
        </div>

        <MinutesPanel
          className={`rec-page__minutes${mobileTab === "minutes" ? " is-open" : ""}`}
          mediaId={mediaId}
          title={minutesTab}
          emptyLabel={minutesEmpty}
          summaryLabel={summaryLabel}
          decisionsLabel={decisionsLabel}
          deadlinesLabel={deadlinesLabel}
          openQuestionsLabel={openQuestionsLabel}
          agreedToLabel={agreedToLabel}
          regenerateLabel={regenerateLabel}
          regeneratingLabel={regeneratingLabel}
          limitLabel={regenerateLimitLabel}
          errorLabel={errorLabel}
          speakerMeta={Object.fromEntries(
            speakers.map((sp) => [
              sp.label,
              {
                name: sp.display_name?.trim() || sp.label,
                colorIdx: sp.color_idx,
                party: sp.party ?? null,
              },
            ]),
          )}
          onSeek={(startMs, segmentIds) => {
            setMobileTab("transcript");
            setEvidenceSegIds(segmentIds);
            setFollowPlayback(false);
            followRef.current = false;
            seekTo(startMs);
            const index = segments.findIndex((s) => s.id === segmentIds[0]);
            if (index >= 0) scrollToSegIndex(index, "smooth");
          }}
        />
      </section>

      {renameOpen ? (
        <div className="rec-rename" role="dialog" aria-modal="true" aria-label={renameLabel}>
          <div className="rec-rename__card">
            <h2>{renameLabel}</h2>
            <ul className="rec-rename__list">
              {speakers.map((sp) => (
                <li key={sp.id}>
                  <span className={`dy-speaker__dot sp-${(sp.color_idx % 6) + 1}`} aria-hidden />
                  <input
                    value={draftNames[sp.id] ?? ""}
                    onChange={(e) =>
                      setDraftNames((prev) => ({ ...prev, [sp.id]: e.target.value }))
                    }
                    aria-label={`Name for ${sp.label}`}
                  />
                  <select
                    value={draftParty[sp.id] ?? ""}
                    onChange={(e) =>
                      setDraftParty((prev) => ({ ...prev, [sp.id]: e.target.value }))
                    }
                    aria-label={`Side for ${sp.label}`}
                  >
                    <option value="">—</option>
                    <option value="our">{ourLabel}</option>
                    <option value="their">{theirLabel}</option>
                  </select>
                </li>
              ))}
            </ul>
            <div className="rec-rename__actions">
              <Button variant="secondary" onClick={() => setRenameOpen(false)}>
                {cancelLabel}
              </Button>
              <Button onClick={() => void saveRename()} disabled={saving}>
                {saveLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
