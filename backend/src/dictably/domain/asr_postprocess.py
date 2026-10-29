"""Post-ASR cleanup (T-035): split long turns, drop hallucinations/repeats, quality warn."""

from __future__ import annotations

import re
from typing import Any

MAX_SEGMENT_MS = 30_000
PAUSE_SPLIT_MS = 1_500
REPEAT_RUN = 3
HALLUCINATION_PHRASES = (
    "thanks for watching",
    "thank you for watching",
    "subscribe",
    "like and subscribe",
    "субтитри зробив",
    "дякую за перегляд",
    "продолжение следует",
)

# Common fillers for "clean" display mode (verbatim stays in storage).
_FILLERS_EN = re.compile(
    r"\b(um+|uh+|erm+|like|you know|i mean|sort of|kind of)\b[,\s]*",
    re.IGNORECASE,
)
_FILLERS_UK = re.compile(
    r"\b(ну+|ее+|е+|типу|значить|короче|як би)\b[,\s]*",
    re.IGNORECASE,
)


def split_long_segments(
    segments: list[dict[str, Any]],
    words: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Split segments longer than ~30s on pauses / sentence ends."""
    out: list[dict[str, Any]] = []
    for seg in segments:
        start = int(seg.get("start_ms") or 0)
        end = int(seg.get("end_ms") or start)
        if end - start <= MAX_SEGMENT_MS:
            out.append(dict(seg))
            continue
        pieces = _split_one(seg, words or [])
        out.extend(pieces)
    # Re-id sequentially for stability.
    for i, seg in enumerate(out, start=1):
        seg["id"] = f"S{i}"
    return out


def _split_one(seg: dict[str, Any], words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    start = int(seg.get("start_ms") or 0)
    end = int(seg.get("end_ms") or start)
    text = str(seg.get("text") or "")
    speaker = seg.get("speaker_id")
    seg_words = [
        w
        for w in words
        if int(w.get("start_ms") or 0) >= start - 5 and int(w.get("end_ms") or 0) <= end + 5
    ]
    if len(seg_words) < 2:
        # Fall back to mid-point chops.
        mid = start + (end - start) // 2
        return [
            {
                "id": seg.get("id"),
                "speaker_id": speaker,
                "start_ms": start,
                "end_ms": mid,
                "text": text[: max(1, len(text) // 2)].strip(),
            },
            {
                "id": seg.get("id"),
                "speaker_id": speaker,
                "start_ms": mid,
                "end_ms": end,
                "text": text[len(text) // 2 :].strip(),
            },
        ]

    cuts: list[int] = []
    chunk_start = start
    for i in range(1, len(seg_words)):
        prev_end = int(seg_words[i - 1].get("end_ms") or 0)
        cur_start = int(seg_words[i].get("start_ms") or 0)
        gap = cur_start - prev_end
        prev_text = str(seg_words[i - 1].get("text") or "")
        sentence_end = prev_text.rstrip().endswith((".", "!", "?", "…"))
        if (gap >= PAUSE_SPLIT_MS or sentence_end) and (prev_end - chunk_start) >= 8_000:
            if (end - prev_end) >= 4_000 and (prev_end - start) < (end - start):
                cuts.append(i)
                chunk_start = cur_start
        # Hard cap: force cut every MAX_SEGMENT_MS.
        if cur_start - chunk_start >= MAX_SEGMENT_MS:
            cuts.append(i)
            chunk_start = cur_start

    if not cuts:
        return [dict(seg)]

    pieces: list[dict[str, Any]] = []
    idx0 = 0
    for cut in cuts + [len(seg_words)]:
        chunk = seg_words[idx0:cut]
        if not chunk:
            continue
        pieces.append(
            {
                "id": seg.get("id"),
                "speaker_id": speaker,
                "start_ms": int(chunk[0].get("start_ms") or start),
                "end_ms": int(chunk[-1].get("end_ms") or end),
                "text": " ".join(str(w.get("text") or "") for w in chunk).strip(),
            }
        )
        idx0 = cut
    return pieces or [dict(seg)]


def drop_hallucinations_and_repeats(
    segments: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """Drop empty / known-hallucination / 3× identical consecutive phrases."""
    kept: list[dict[str, Any]] = []
    dropped = 0
    run_text: str | None = None
    run_count = 0
    for seg in segments:
        text = " ".join(str(seg.get("text") or "").split()).strip()
        if not text:
            dropped += 1
            continue
        low = text.lower()
        if any(p in low for p in HALLUCINATION_PHRASES) and len(text.split()) <= 12:
            dropped += 1
            continue
        norm = low
        if norm == run_text:
            run_count += 1
            if run_count >= REPEAT_RUN:
                dropped += 1
                continue
        else:
            run_text = norm
            run_count = 1
        kept.append({**seg, "text": text})
    return kept, dropped


def clean_display_text(text: str) -> str:
    """Strip fillers for clean mode (display only)."""
    out = _FILLERS_EN.sub(" ", text)
    out = _FILLERS_UK.sub(" ", out)
    return re.sub(r"\s{2,}", " ", out).strip()


def apply_transcript_mode(
    segments: list[dict[str, Any]],
    *,
    mode: str,
) -> list[dict[str, Any]]:
    if mode != "clean":
        return segments
    return [{**s, "text": clean_display_text(str(s.get("text") or ""))} for s in segments]


def quality_warning_from_transcript(
    *,
    duration_ms: int | None,
    segments: list[dict[str, Any]],
    words: list[dict[str, Any]],
    sample_rate_hint: int | None = None,
    channels: int | None = None,
    speech_ratio: float | None = None,
) -> str | None:
    """Human-readable quality warning for the recording page, or None."""
    reasons: list[str] = []
    if sample_rate_hint is not None and sample_rate_hint > 0 and sample_rate_hint < 12_000:
        reasons.append("This recording sounds like telephone quality (low sample rate).")
    if channels == 1:
        # Only warn when expected call-like but we can't know — skip generic.
        pass
    spoken_ms = 0
    for seg in segments:
        spoken_ms += max(0, int(seg.get("end_ms") or 0) - int(seg.get("start_ms") or 0))
    dur = duration_ms or 0
    ratio = speech_ratio
    if ratio is None and dur > 0:
        ratio = min(1.0, spoken_ms / dur)
    if ratio is not None and ratio < 0.15 and dur >= 60_000:
        reasons.append(
            "Little speech detected — background noise or long silence may hurt accuracy."
        )
    confs = [float(w["confidence"]) for w in words if w.get("confidence") is not None]
    if confs and (sum(confs) / len(confs)) < 0.55:
        reasons.append("Recognition confidence is low — consider a clearer mic or less noise.")
    labels = {str(s.get("speaker_id") or "") for s in segments if s.get("speaker_id")}
    if len(labels) <= 1 and dur >= 120_000:
        reasons.append(
            "Only one speaker detected — if this was a call, the other side may be missing."
        )
    if not reasons:
        return None
    return " ".join(reasons)


def postprocess_transcript(
    transcript: dict[str, Any],
    *,
    duration_ms: int | None = None,
    sample_rate_hint: int | None = None,
    channels: int | None = None,
) -> dict[str, Any]:
    """Mutate-safe: return cleaned transcript + meta."""
    segments = list(transcript.get("segments") or [])
    words = list(transcript.get("words") or [])
    segments = split_long_segments(segments, words)
    segments, dropped = drop_hallucinations_and_repeats(segments)
    warn = quality_warning_from_transcript(
        duration_ms=duration_ms or transcript.get("duration_ms"),
        segments=segments,
        words=words,
        sample_rate_hint=sample_rate_hint,
        channels=channels,
    )
    out = dict(transcript)
    out["segments"] = segments
    out["words"] = words
    out["postprocess"] = {"dropped_segments": dropped, "quality_warning": warn}
    return out
