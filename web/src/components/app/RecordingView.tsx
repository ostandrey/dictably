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
  FOLLOW_UP_MAILTO_BODY_MAX,
  getFollowUpEmail,
  getMedia,
  getPeaks,
  getTranscript,
  mediaAudioUrl,
  mergeSpeakers,
  patchMedia,
  patchSegmentSpeaker,
  patchSpeaker,
  patchWord,
  retryMedia,
  splitSegmentSpeaker,
  type ExportFormat,
  type ExportKind,
  type MediaItem,
  type Speaker,
  type Transcript,
} from "@/lib/api";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/app/ToastProvider";
import { IllDeleted, IllFailed } from "@/components/illustrations";
import { Alert, BottomSheet, Button, Dialog, EmptyState } from "@/components/ui";
import {
  APP_RECORDING_STACK_MAX_PX,
  useIsMobile,
} from "@/hooks/useIsMobile";
import {
  joinMeta,
  mediaDisplayTitle,
  uiDateLocale,
} from "@/lib/mediaDisplay";
import {
  clearRecordingDraft,
  loadRecordingDraft,
  saveRecordingDraft,
} from "@/lib/recordingDrafts";
import { MinutesPanel } from "./MinutesPanel";
import { TranscriptSegment } from "./TranscriptSegment";

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
  exportFollowUp: string;
  exportFollowUpTitle: string;
  exportFollowUpSubject: string;
  exportFollowUpBody: string;
  exportFollowUpCopy: string;
  exportFollowUpCopied: string;
  exportFollowUpMail: string;
  exportFollowUpMailtoHint: string;
  exportFollowUpWeak: string;
  exportTranscriptTxt: string;
  exportTranscriptDocx: string;
  exportTranscriptSrt: string;
  exportTranscriptVtt: string;
  exportFailed: string;
  partySideLabel?: string;
  mergeWithLabel?: string;
  changeSpeakerLabel?: string;
  newSpeakerLabel?: string;
  cleanModeLabel?: string;
  verbatimModeLabel?: string;
  meetingDateHint?: string;
  dueDatesRecalcToast?: string;
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

function formatMeetingDate(isoDate: string, locale: "en" | "uk"): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat(uiDateLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
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
  exportFollowUp,
  exportFollowUpTitle,
  exportFollowUpSubject,
  exportFollowUpBody,
  exportFollowUpCopy,
  exportFollowUpCopied,
  exportFollowUpMail,
  exportFollowUpMailtoHint,
  exportFollowUpWeak,
  exportTranscriptTxt,
  exportTranscriptDocx,
  exportTranscriptSrt,
  exportTranscriptVtt,
  exportFailed,
  partySideLabel = "Side",
  mergeWithLabel = "Merge with…",
  changeSpeakerLabel = "Change speaker",
  newSpeakerLabel = "New speaker from this turn",
  cleanModeLabel = "Clean",
  verbatimModeLabel = "Verbatim",
  meetingDateHint = "Change meeting date",
  dueDatesRecalcToast = "Due dates in minutes recalculated",
}: Props) {
  const tApp = useTranslations("app");
  const isMobile = useIsMobile();
  const stackTabs = useIsMobile(APP_RECORDING_STACK_MAX_PX);
  const { push: pushToast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const lastScrollY = useRef(0);

  const [media, setMedia] = useState<MediaItem | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [statusLive, setStatusLive] = useState("");
  const [currentSec, setCurrentSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [mobileTab, setMobileTab] = useState<"transcript" | "minutes">("minutes");
  const [waveWidth, setWaveWidth] = useState(320);
  const [playerCollapsed, setPlayerCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [titleRenameOpen, setTitleRenameOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleBusy, setTitleBusy] = useState(false);
  const [externalRegenOpen, setExternalRegenOpen] = useState(false);
  const [externalTemplatePick, setExternalTemplatePick] = useState<string | null>(
    null,
  );
  const [regenLeft, setRegenLeft] = useState(0);
  const [currentTemplate, setCurrentTemplate] = useState("default");
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftParty, setDraftParty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [evidenceSegIds, setEvidenceSegIds] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [followUpWeak, setFollowUpWeak] = useState<string[]>([]);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [editingWord, setEditingWord] = useState<{
    index: number;
    text: string;
  } | null>(null);
  const [mergeWith, setMergeWith] = useState<Record<string, string>>({});
  const [meetingDraft, setMeetingDraft] = useState<string>("");
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [segMenuId, setSegMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setGone(false);
    try {
      const m = await getMedia(mediaId);
      setMedia(m);
      if (m.status === "failed") {
        setTranscript(null);
        setPeaks([]);
        return;
      }
      const [t, p] = await Promise.all([
        getTranscript(mediaId),
        getPeaks(mediaId).catch(() => [] as number[]),
      ]);
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
      if (err instanceof ApiError && err.status === 404) {
        setGone(true);
        setMedia(null);
        setTranscript(null);
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

  // T-040: restore unsaved title / meeting date / word edits after reload.
  useEffect(() => {
    const draft = loadRecordingDraft(mediaId);
    if (!draft) return;
    if (draft.title) setTitleDraft(draft.title);
    if (draft.meetingDate) {
      setMeetingDraft(draft.meetingDate);
      setEditingMeeting(true);
    }
  }, [mediaId]);

  useEffect(() => {
    if (!media) return;
    setStatusLive(
      media.status === "ready"
        ? tApp("statusReady")
        : media.status === "failed"
          ? tApp("statusFailed")
          : tApp("statusProcessing"),
    );
  }, [media?.status, tApp, media]);

  useEffect(() => {
    if (!isMobile) {
      setPlayerCollapsed(false);
      return;
    }
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const prev = lastScrollY.current;
      lastScrollY.current = y;
      if (y > prev + 8 && y > 64) setPlayerCollapsed(true);
      else if (y < prev - 8) setPlayerCollapsed(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

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

  const pauseFollow = useCallback(() => {
    if (ignoreScrollRef.current) return;
    if (followRef.current) {
      followRef.current = false;
      setFollowPlayback(false);
    }
  }, []);

  function resumeFollow() {
    setFollowPlayback(true);
    followRef.current = true;
    scrollToSegIndex(activeSegIndex, "smooth");
  }

  const seekTo = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.dataset.seekMs = String(Math.round(ms));
    audio.currentTime = ms / 1000;
    void audio.play();
    setCurrentSec(ms / 1000);
  }, []);

  const onSegSeek = useCallback(
    (ms: number) => {
      pauseFollow();
      setEvidenceSegIds([]);
      seekTo(ms);
    },
    [pauseFollow, seekTo],
  );

  const onToggleSegMenu = useCallback((segId: string) => {
    setSegMenuId((cur) => (cur === segId ? null : segId));
  }, []);

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
      // Pairwise merges: source → keep target (S1).
      const done = new Set<string>();
      for (const [fromId, intoId] of Object.entries(mergeWith)) {
        if (!intoId || fromId === intoId || done.has(fromId)) continue;
        await mergeSpeakers(mediaId, { keep_id: intoId, merge_ids: [fromId] });
        done.add(fromId);
      }
      await load();
      setRenameOpen(false);
      setMergeWith({});
    } catch {
      setError(errorLabel);
    } finally {
      setSaving(false);
    }
  }

  async function saveWordEdit() {
    if (!editingWord) return;
    setSaving(true);
    setError(null);
    try {
      const next = await patchWord(mediaId, {
        word_index: editingWord.index,
        text: editingWord.text,
      });
      setTranscript(next);
      setEditingWord(null);
      const draft = loadRecordingDraft(mediaId) ?? {};
      const words = { ...(draft.words ?? {}) };
      delete words[String(editingWord.index)];
      saveRecordingDraft(mediaId, { ...draft, words });
      if (!Object.keys(words).length && !draft.title && !draft.meetingDate) {
        clearRecordingDraft(mediaId);
      }
    } catch {
      setError(errorLabel);
      saveRecordingDraft(mediaId, {
        words: { [String(editingWord.index)]: editingWord.text },
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveMeetingDate() {
    if (!meetingDraft) return;
    setSaving(true);
    setError(null);
    try {
      const prev = media?.meeting_date;
      const m = await patchMedia(mediaId, { meeting_date: meetingDraft });
      setMedia(m);
      setEditingMeeting(false);
      const draft = loadRecordingDraft(mediaId) ?? {};
      saveRecordingDraft(mediaId, { ...draft, meetingDate: undefined });
      if (prev && prev !== meetingDraft) pushToast(dueDatesRecalcToast);
    } catch {
      setError(errorLabel);
      saveRecordingDraft(mediaId, { meetingDate: meetingDraft });
    } finally {
      setSaving(false);
    }
  }

  async function onRetryFailed() {
    setRetryBusy(true);
    setError(null);
    try {
      const m = await retryMedia(mediaId);
      setMedia(m);
      setStatusLive(tApp("statusProcessing"));
      await load();
    } catch {
      setError(errorLabel);
    } finally {
      setRetryBusy(false);
    }
  }

  async function setTranscriptMode(mode: "clean" | "verbatim") {
    setSaving(true);
    setError(null);
    try {
      const m = await patchMedia(mediaId, { transcript_mode: mode });
      setMedia(m);
      const t = await getTranscript(mediaId);
      setTranscript(t);
    } catch {
      setError(errorLabel);
    } finally {
      setSaving(false);
    }
  }

  const onChangeSegSpeaker = useCallback(
    async (segId: string, speakerId: string) => {
      setSegMenuId(null);
      setSaving(true);
      setError(null);
      try {
        const t = await patchSegmentSpeaker(mediaId, segId, speakerId);
        setTranscript(t);
      } catch {
        setError(errorLabel);
      } finally {
        setSaving(false);
      }
    },
    [errorLabel, mediaId],
  );

  const onSplitSegSpeaker = useCallback(
    async (segId: string) => {
      setSegMenuId(null);
      setSaving(true);
      setError(null);
      try {
        const t = await splitSegmentSpeaker(mediaId, segId);
        setTranscript(t);
      } catch {
        setError(errorLabel);
      } finally {
        setSaving(false);
      }
    },
    [errorLabel, mediaId],
  );

  function renderSegText(segId: string, text: string): ReactNode {
    const segWords = wordsBySeg.get(segId);
    const q = query.trim();
    if (!segWords?.length) return highlightPlain(text, q);
    return segWords.map((w, i) => {
      const globalIdx = words.indexOf(w);
      const isNow = globalIdx === activeWordIndex;
      const hit =
        q && w.text.toLowerCase().includes(q.toLowerCase()) ? " rec-hit" : "";
      const editing = editingWord?.index === globalIdx;
      if (editing) {
        return (
          <span key={`${segId}-w-${i}`} className="rec-word is-editing" data-recording="word-edit">
            <input
              value={editingWord.text}
              aria-label="Edit word"
              data-recording="word-input"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                setEditingWord({ index: globalIdx, text: e.target.value })
              }
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveWordEdit();
                }
                if (e.key === "Escape") setEditingWord(null);
              }}
              onBlur={() => void saveWordEdit()}
            />
          </span>
        );
      }
      return (
        <span
          key={`${segId}-w-${i}`}
          className={`rec-word${isNow ? " is-now" : ""}${hit}`}
          data-recording="word"
          data-word-index={globalIdx}
          title="Click to edit"
          onClick={(e) => {
            e.stopPropagation();
            if (globalIdx < 0) return;
            setEditingWord({ index: globalIdx, text: w.text });
          }}
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

  async function openFollowUpDialog() {
    setExportBusy(true);
    setError(null);
    try {
      const draft = await getFollowUpEmail(mediaId);
      setFollowUpSubject(draft.subject);
      setFollowUpBody(draft.body);
      setFollowUpWeak(draft.weak_texts ?? []);
      setExportOpen(false);
      setFollowUpOpen(true);
    } catch {
      setError(exportFailed);
    } finally {
      setExportBusy(false);
    }
  }

  async function copyFollowUpFromDialog() {
    setFollowUpBusy(true);
    try {
      const text = `${followUpSubject}\n\n${followUpBody}`;
      await navigator.clipboard.writeText(text);
      pushToast(exportFollowUpCopied);
    } catch {
      setError(exportFailed);
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function mailtoFollowUpFromDialog() {
    setFollowUpBusy(true);
    try {
      const subject = followUpSubject;
      const body = followUpBody;
      if (body.length > FOLLOW_UP_MAILTO_BODY_MAX) {
        await navigator.clipboard.writeText(body);
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}`;
        pushToast(exportFollowUpMailtoHint);
      } else {
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
    } catch {
      setError(exportFailed);
    } finally {
      setFollowUpBusy(false);
    }
  }

  if (gone) {
    return (
      <div className="rec-page" data-recording="page" data-recording-gone>
        <EmptyState
          title={tApp("recordingGoneTitle")}
          illustration={<IllDeleted />}
          action={
            <a href={recordingsHref} className="btn-secondary" data-recording="gone-back">
              {tApp("backToRecordings")}
            </a>
          }
        >
          {tApp("recordingGoneBody")}
        </EmptyState>
      </div>
    );
  }

  if (error && !media) {
    return (
      <div data-recording="load-error">
        <Alert tone="danger" data-recording="error">
          {error}
        </Alert>
        <button
          type="button"
          className="btn-secondary"
          data-recording="retry"
          onClick={() => void load()}
        >
          {tApp("retry")}
        </button>
      </div>
    );
  }

  if (media?.status === "failed") {
    return (
      <div className="rec-page" data-recording="page" data-recording-failed>
        <div className="visually-hidden" aria-live="polite">
          {statusLive}
        </div>
        <EmptyState
          title={tApp("statusFailed")}
          illustration={<IllFailed />}
          action={
            <div className="dy-empty__actions">
              <button
                type="button"
                className="btn-primary"
                data-recording="retry-failed"
                disabled={retryBusy}
                onClick={() => void onRetryFailed()}
              >
                {retryBusy ? tApp("loading") : tApp("retry")}
              </button>
              <a href={recordingsHref} className="btn-secondary">
                {recordingsLabel}
              </a>
            </div>
          }
        >
          {media.error?.trim() || tApp("statusFailedHint")}
        </EmptyState>
      </div>
    );
  }

  if (!media || !transcript) {
    return <p className="dy-muted">Loading…</p>;
  }

  const displayTitle = mediaDisplayTitle(
    media,
    locale,
    tApp("provisionalMeeting"),
  );

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

  const shareItems = (
    <>
      <button
        type="button"
        role="menuitem"
        className="rec-page__export-item"
        data-export="minutes-pdf"
        disabled={exportBusy}
        onClick={() => {
          setShareOpen(false);
          setExportOpen(false);
          void runExport("minutes", "pdf");
        }}
      >
        {exportMinutesPdf}
      </button>
      <button
        type="button"
        role="menuitem"
        className="rec-page__export-item"
        data-export="minutes-docx"
        disabled={exportBusy}
        onClick={() => {
          setShareOpen(false);
          setExportOpen(false);
          void runExport("minutes", "docx");
        }}
      >
        {exportMinutesDocx}
      </button>
      <button
        type="button"
        role="menuitem"
        className="rec-page__export-item"
        data-export="follow-up"
        disabled={exportBusy}
        onClick={() => {
          setShareOpen(false);
          setExportOpen(false);
          void openFollowUpDialog();
        }}
      >
        {exportFollowUp}
      </button>
      <button
        type="button"
        role="menuitem"
        className="rec-page__export-item"
        data-export="minutes-copy"
        disabled={exportBusy}
        onClick={() => {
          setShareOpen(false);
          setExportOpen(false);
          void copyMinutes();
        }}
      >
        {copiedFlash ? exportMinutesCopied : exportMinutesCopy}
      </button>
    </>
  );

  return (
    <div
      className={`rec-page${playerCollapsed ? " is-player-collapsed" : ""}`}
      data-recording="page"
      ref={pageScrollRef}
    >
      <header className="rec-page__crumb">
        <div className="rec-page__crumb-path">
          {isMobile ? (
            <a href={recordingsHref} data-recording="crumb-back">
              ← {recordingsLabel}
            </a>
          ) : (
            <>
              <a href={recordingsHref}>{recordingsLabel}</a>
              <span aria-hidden>/</span>
              <span>{displayTitle}</span>
            </>
          )}
        </div>
        <div className="rec-page__crumb-actions">
          {!isMobile ? (
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
                  {shareItems}
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
          ) : null}
          {isMobile ? (
            <button
              type="button"
              className="rec-page__share-btn"
              data-recording="share"
              aria-label={tApp("shareRecording")}
              onClick={() => setShareOpen(true)}
            >
              {tApp("shareRecording")}
            </button>
          ) : null}
          <div className="rec-page__more" ref={moreMenuRef}>
            <button
              type="button"
              className="rec-page__more-btn"
              data-recording="more"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-label={tApp("recordingMenu")}
              onClick={() => setMoreOpen((v) => !v)}
            >
              ···
            </button>
            {moreOpen ? (
              <div className="rec-page__export-pop" role="menu" data-recording="more-menu">
                <button
                  type="button"
                  role="menuitem"
                  className="rec-page__export-item"
                  data-recording="rename-title"
                  onClick={() => {
                    setMoreOpen(false);
                    setTitleDraft((media.title ?? "").trim() || displayTitle);
                    setTitleRenameOpen(true);
                  }}
                >
                  {tApp("renameRecording")}
                </button>
                {regenLeft > 0 ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="rec-page__export-item"
                    data-minutes="regenerate-menu"
                    onClick={() => {
                      setMoreOpen(false);
                      setExternalRegenOpen(true);
                    }}
                  >
                    {regenerateLabel}
                  </button>
                ) : null}
                {isMobile || stackTabs ? (
                  <>
                    <div
                      className="rec-page__export-label"
                      role="presentation"
                      data-minutes="template-group"
                    >
                      {tApp("minutesTemplate")}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className={`rec-page__export-item${currentTemplate === "default" ? " is-current" : ""}`}
                      data-minutes="template-pick-default"
                      aria-current={
                        currentTemplate === "default" ? "true" : undefined
                      }
                      onClick={() => {
                        setMoreOpen(false);
                        setExternalTemplatePick("default");
                      }}
                    >
                      {tApp("minutesTemplateDefault")}
                      {currentTemplate === "default" ? (
                        <span className="rec-page__export-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`rec-page__export-item${currentTemplate === "official_protocol" ? " is-current" : ""}`}
                      data-minutes="template-pick-official"
                      aria-current={
                        currentTemplate === "official_protocol"
                          ? "true"
                          : undefined
                      }
                      onClick={() => {
                        setMoreOpen(false);
                        setExternalTemplatePick("official_protocol");
                      }}
                    >
                      {tApp("minutesTemplateOfficial")}
                      {currentTemplate === "official_protocol" ? (
                        <span className="rec-page__export-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="rec-page__export-item"
                  data-recording="rename"
                  onClick={() => {
                    setMoreOpen(false);
                    setRenameOpen(true);
                  }}
                >
                  {renameLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="rec-page__hero" data-recording="player-band">
        <div className="rec-page__title-row">
          <div>
            <h1 className="rec-page__title">{displayTitle}</h1>
            <p className="rec-page__meta dy-time" data-recording="meta">
              {(() => {
                const langCode = media.language || transcript.language || null;
                let langLabel: string | null = null;
                if (langCode) {
                  try {
                    langLabel =
                      new Intl.DisplayNames(uiDateLocale(locale), {
                        type: "language",
                      }).of(langCode) || langCode;
                  } catch {
                    langLabel = langCode;
                  }
                }
                const bits = joinMeta([formatClock(durationSec), langLabel]);
                return bits ? <>{bits} · </> : null;
              })()}
              {editingMeeting ? (
                <span data-recording="meeting-date-edit">
                  <input
                    type="date"
                    value={meetingDraft}
                    aria-label={meetingDateHint}
                    data-recording="meeting-date-input"
                    onChange={(e) => {
                      const v = e.target.value;
                      setMeetingDraft(v);
                      saveRecordingDraft(mediaId, {
                        meetingDate: v || undefined,
                      });
                    }}
                    onBlur={() => void saveMeetingDate()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveMeetingDate();
                      if (e.key === "Escape") setEditingMeeting(false);
                    }}
                  />
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-text rec-page__meeting-date"
                  data-recording="meeting-date"
                  title={meetingDateHint}
                  onClick={() => {
                    setMeetingDraft(
                      media.meeting_date ||
                        (media.created_at ? media.created_at.slice(0, 10) : ""),
                    );
                    setEditingMeeting(true);
                  }}
                >
                  {formatMeetingDate(
                    media.meeting_date ||
                      (media.created_at ? media.created_at.slice(0, 10) : ""),
                    locale,
                  )}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path d="M4 20h4l10-10-4-4L4 16v4z" />
                    <path d="M13 7l4 4" />
                  </svg>
                </button>
              )}
            </p>
            {(media.title ?? "").trim() &&
            media.filename !== displayTitle ? (
              <p className="rec-page__filename dy-muted" data-recording="filename">
                {media.filename}
              </p>
            ) : null}
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
              className="btn-text rec-page__rename-speakers"
              data-recording="rename"
              onClick={() => setRenameOpen(true)}
            >
              {renameLabel}
            </button>
          </div>
        </div>
        <div
          className={`dy-player rec-page__player${playerCollapsed ? " is-collapsed" : ""}`}
          data-recording="player"
          onClick={() => {
            if (playerCollapsed) setPlayerCollapsed(false);
          }}
        >
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

      {media.quality_warning ? (
        <Alert tone="warning" data-recording="quality-warning">
          {media.quality_warning}
        </Alert>
      ) : null}

      {error ? (
        <div data-recording="error-wrap">
          <Alert tone="danger" data-recording="error">
            {error}
          </Alert>
          <button
            type="button"
            className="btn-secondary"
            data-recording="retry"
            onClick={() => void load()}
          >
            {tApp("retry")}
          </button>
        </div>
      ) : null}

      <div className="visually-hidden" aria-live="polite" data-recording="status-live">
        {statusLive}
      </div>

      <div
        className="rec-page__tabs dy-tabs"
        role="tablist"
        aria-label="Recording"
        data-recording="tabs"
      >
        <button
          type="button"
          role="tab"
          className="dy-tab"
          aria-selected={mobileTab === "minutes"}
          onClick={() => setMobileTab("minutes")}
          data-recording="tab-minutes"
        >
          {minutesTab}
        </button>
        <button
          type="button"
          role="tab"
          className="dy-tab"
          aria-selected={mobileTab === "transcript"}
          onClick={() => setMobileTab("transcript")}
          data-recording="tab-transcript"
        >
          {transcriptTab}
        </button>
      </div>

      <section className="rec-page__body">
        <div
          className={`rec-page__transcript${mobileTab === "transcript" || !stackTabs ? " is-open" : ""}`}
          data-recording="transcript"
        >
          <div className="rec-page__transcript-head">
            <h2>{transcriptTab}</h2>
            <div
              className="rec-page__mode"
              role="group"
              aria-label="Transcript mode"
              data-recording="transcript-mode"
            >
              <button
                type="button"
                className={`btn-text${(media.transcript_mode || "clean") === "clean" ? " is-active" : ""}`}
                data-recording="mode-clean"
                disabled={saving}
                onClick={() => void setTranscriptMode("clean")}
              >
                {cleanModeLabel}
              </button>
              <button
                type="button"
                className={`btn-text${media.transcript_mode === "verbatim" ? " is-active" : ""}`}
                data-recording="mode-verbatim"
                disabled={saving}
                onClick={() => void setTranscriptMode("verbatim")}
              >
                {verbatimModeLabel}
              </button>
            </div>
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
                  return (
                    <TranscriptSegment
                      key={seg.id}
                      segId={seg.id}
                      startMs={seg.start_ms}
                      speakerId={seg.speaker_id}
                      index={row.index}
                      rowStart={row.start}
                      active={seg.id === activeSegId}
                      isMatch={matchIds.includes(seg.id)}
                      isCurrentMatch={
                        matchIds[matchIdx] === seg.id && matchIds.length > 0
                      }
                      isEvidence={evidenceSegIds.includes(seg.id)}
                      menuOpen={segMenuId === seg.id}
                      speakers={speakers}
                      changeSpeakerLabel={changeSpeakerLabel ?? "Change speaker"}
                      newSpeakerLabel={newSpeakerLabel ?? "New speaker"}
                      textNode={renderSegText(seg.id, seg.text)}
                      onMeasure={virtualizer.measureElement}
                      onToggleMenu={onToggleSegMenu}
                      onSeek={onSegSeek}
                      onChangeSpeaker={onChangeSegSpeaker}
                      onSplitSpeaker={onSplitSegSpeaker}
                    />
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
          className={`rec-page__minutes${mobileTab === "minutes" || !stackTabs ? " is-open" : ""}`}
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
          hideRegenerate
          externalRegenOpen={externalRegenOpen}
          onExternalRegenClose={() => setExternalRegenOpen(false)}
          externalTemplatePick={externalTemplatePick}
          onExternalTemplateHandled={() => setExternalTemplatePick(null)}
          onRegenMeta={(meta) => {
            setRegenLeft(meta.left);
            setCurrentTemplate(meta.template);
          }}
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

      <BottomSheet
        open={shareOpen}
        title={tApp("shareSheetTitle")}
        onClose={() => setShareOpen(false)}
      >
        <div className="dy-sheet__list" role="menu" data-recording="share-sheet">
          {shareItems}
        </div>
      </BottomSheet>

      <Dialog
        open={titleRenameOpen}
        title={tApp("renameRecordingTitle")}
        onClose={() => {
          if (!titleBusy) setTitleRenameOpen(false);
        }}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={titleBusy}
              onClick={() => setTitleRenameOpen(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              loading={titleBusy}
              data-recording="title-save"
              onClick={() => {
                void (async () => {
                  setTitleBusy(true);
                  try {
                    const m = await patchMedia(mediaId, {
                      title: titleDraft.trim() || null,
                    });
                    setMedia(m);
                    setTitleRenameOpen(false);
                    const draft = loadRecordingDraft(mediaId) ?? {};
                    saveRecordingDraft(mediaId, { ...draft, title: undefined });
                  } catch {
                    setError(errorLabel);
                    saveRecordingDraft(mediaId, {
                      title: titleDraft.trim() || undefined,
                    });
                  } finally {
                    setTitleBusy(false);
                  }
                })();
              }}
            >
              {tApp("renameRecordingSave")}
            </Button>
          </>
        }
      >
        <label className="dy-field">
          <span className="visually-hidden">{tApp("renameRecordingTitle")}</span>
          <input
            type="text"
            value={titleDraft}
            maxLength={120}
            data-recording="title-input"
            onChange={(e) => {
              const v = e.target.value;
              setTitleDraft(v);
              saveRecordingDraft(mediaId, { title: v.trim() || undefined });
            }}
          />
        </label>
        <p className="dy-muted">{media.filename}</p>
      </Dialog>

      <Dialog
        open={followUpOpen}
        title={exportFollowUpTitle}
        size="lg"
        onClose={() => setFollowUpOpen(false)}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={followUpBusy}
              data-follow-up="copy"
              onClick={() => void copyFollowUpFromDialog()}
            >
              {exportFollowUpCopy}
            </Button>
            <Button
              disabled={followUpBusy}
              data-follow-up="mailto"
              onClick={() => void mailtoFollowUpFromDialog()}
            >
              {exportFollowUpMail}
            </Button>
          </>
        }
      >
        <div className="rec-follow-up" data-recording="follow-up-dialog">
          {followUpWeak.length > 0 ? (
            <>
              <p className="rec-follow-up__note">
                {exportFollowUpWeak.replace("{count}", String(followUpWeak.length))}
              </p>
              <ul className="rec-follow-up__weak">
                {followUpWeak.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          ) : null}
          <label className="dy-field">
            <span className="dy-field__label">{exportFollowUpSubject}</span>
            <input
              className="dy-input"
              value={followUpSubject}
              onChange={(e) => setFollowUpSubject(e.target.value)}
              data-follow-up="subject"
            />
          </label>
          <label className="dy-field">
            <span className="dy-field__label">{exportFollowUpBody}</span>
            <textarea
              className="dy-textarea"
              value={followUpBody}
              onChange={(e) => setFollowUpBody(e.target.value)}
              data-follow-up="body"
            />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={renameOpen}
        title={renameLabel}
        onClose={() => {
          setRenameOpen(false);
          setMergeWith({});
        }}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRenameOpen(false);
                setMergeWith({});
              }}
            >
              {cancelLabel}
            </Button>
            <Button onClick={() => void saveRename()} disabled={saving}>
              {saveLabel}
            </Button>
          </>
        }
      >
        <ul className="rec-rename__list" data-recording="rename-list">
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
              <label className="rec-rename__party">
                <span>{partySideLabel}</span>
                <select
                  value={draftParty[sp.id] ?? ""}
                  onChange={(e) =>
                    setDraftParty((prev) => ({ ...prev, [sp.id]: e.target.value }))
                  }
                  aria-label={`${partySideLabel}: ${sp.label}`}
                >
                  <option value="">—</option>
                  <option value="our">{ourLabel}</option>
                  <option value="their">{theirLabel}</option>
                </select>
              </label>
              {speakers.length >= 2 ? (
                <label className="rec-rename__merge" data-recording="merge-speakers">
                  <span>{mergeWithLabel}</span>
                  <select
                    value={mergeWith[sp.id] ?? ""}
                    data-recording="merge-keep"
                    onChange={(e) =>
                      setMergeWith((prev) => ({ ...prev, [sp.id]: e.target.value }))
                    }
                    aria-label={`${mergeWithLabel} ${sp.label}`}
                  >
                    <option value="">—</option>
                    {speakers
                      .filter((other) => other.id !== sp.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {draftNames[other.id] || other.display_name || other.label}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
