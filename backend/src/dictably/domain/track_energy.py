"""Assign speakers from per-track RMS energy (T-035b — one ASR on mix)."""

from __future__ import annotations

import logging
import math
import struct
import subprocess
from pathlib import Path
from typing import Any

from dictably.domain.ffmpeg_media import FFMPEG_TIMEOUT_S, FfmpegError, require_ffmpeg

logger = logging.getLogger(__name__)

# Envelope rate: 16 kHz PCM → RMS every 10 ms → 100 frames/s (keeps voice band).
PCM_RATE = 16_000
WINDOW_SAMPLES = 160  # 10 ms
ENERGY_HZ = PCM_RATE // WINDOW_SAMPLES  # 100
# Relative to peak track energy in the window — below this = silence.
REL_FLOOR = 0.15
ABS_FLOOR = 0.02
# Share of segment duration where ≥2 tracks are active → split by words.
OVERLAP_RATIO = 0.30


def rms_envelope(
    src: Path,
    *,
    soft_missing: bool = False,
) -> list[float]:
    """Stream mono PCM @ 16 kHz; RMS per 10 ms window (0..1). Does not buffer the whole file."""
    try:
        ffmpeg = require_ffmpeg()
    except FfmpegError:
        if soft_missing:
            return []
        raise

    cmd = [
        ffmpeg,
        "-protocol_whitelist",
        "file",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        str(PCM_RATE),
        "-f",
        "s16le",
        "pipe:1",
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except OSError:
        if soft_missing:
            return []
        raise FfmpegError("ffmpeg failed to start") from None

    assert proc.stdout is not None
    envelope: list[float] = []
    pending = b""
    window_bytes = WINDOW_SAMPLES * 2
    try:
        while True:
            block = proc.stdout.read(65_536)
            if not block:
                break
            pending += block
            while len(pending) >= window_bytes:
                chunk = pending[:window_bytes]
                pending = pending[window_bytes:]
                vals = struct.unpack(f"<{WINDOW_SAMPLES}h", chunk)
                rms = math.sqrt(sum(v * v for v in vals) / WINDOW_SAMPLES) / 32768.0
                envelope.append(min(1.0, rms))
        stderr = proc.stderr.read() if proc.stderr else b""
        rc = proc.wait(timeout=FFMPEG_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        proc.kill()
        proc.wait()
        if soft_missing:
            return []
        raise FfmpegError("ffmpeg timed out") from exc

    if rc != 0:
        logger.debug("rms envelope failed: %s", (stderr or b"")[:400])
        if soft_missing:
            return []
        raise FfmpegError("ffmpeg envelope failed")

    return envelope


def synthetic_envelopes(
    n_tracks: int,
    duration_ms: int,
    *,
    hz: int = ENERGY_HZ,
) -> list[list[float]]:
    """Deterministic soft envelopes: track i loud on second slots i, i+n, … (tests only)."""
    frames = max(hz, int(math.ceil(duration_ms / 1000 * hz)) or hz)
    out: list[list[float]] = []
    for i in range(n_tracks):
        env: list[float] = []
        for f in range(frames):
            sec = f // hz
            env.append(0.8 if (sec % n_tracks) == i else 0.02)
        out.append(env)
    return out


def extract_track_envelopes(
    paths: list[Path],
    *,
    duration_ms: int | None,
    soft_missing: bool = False,
) -> list[list[float]]:
    """One envelope per track.

    Soft/missing ffmpeg may use synthetic envelopes. Production empty envelope → FfmpegError (B4).
    """
    envs: list[list[float]] = []
    for p in paths:
        envs.append(rms_envelope(p, soft_missing=soft_missing))
    if any(len(e) == 0 for e in envs) or not envs:
        if soft_missing:
            dur = duration_ms or 30_000
            return synthetic_envelopes(len(paths), dur)
        raise FfmpegError("empty track envelope")
    # Pad to common length
    longest = max(len(e) for e in envs)
    padded: list[list[float]] = []
    for e in envs:
        if len(e) < longest:
            padded.append(e + [0.0] * (longest - len(e)))
        else:
            padded.append(e)
    return padded


def _frame_range(start_ms: int, end_ms: int, n_frames: int, hz: int = ENERGY_HZ) -> range:
    a = max(0, int(start_ms * hz / 1000))
    b = max(a + 1, int(math.ceil(end_ms * hz / 1000)))
    return range(a, min(b, n_frames))


def _mean_energy(env: list[float], fr: range) -> float:
    if not fr:
        return 0.0
    total = sum(env[i] for i in fr if i < len(env))
    return total / len(fr)


def _argmax(energies: list[float]) -> int:
    best_i = 0
    best_v = -1.0
    for i, e in enumerate(energies):
        if e > best_v:
            best_v = e
            best_i = i
    return best_i


def _overlap_ratio(
    envelopes: list[list[float]],
    fr: range,
) -> float:
    """Fraction of frames where ≥2 tracks are above floor."""
    if not fr:
        return 0.0
    overlap = 0
    for i in fr:
        vals = [env[i] if i < len(env) else 0.0 for env in envelopes]
        peak = max(vals) if vals else 0.0
        floor = max(ABS_FLOOR, peak * REL_FLOOR)
        if sum(1 for v in vals if v >= floor) >= 2:
            overlap += 1
    return overlap / len(fr)


def assign_speakers_by_energy(
    transcript: dict[str, Any],
    tracks_meta: list[dict[str, Any]],
    envelopes: list[list[float]],
    *,
    hz: int = ENERGY_HZ,
) -> dict[str, Any]:
    """Rewrite speakers/segments/words using per-track energy (one ASR pass)."""
    if len(tracks_meta) < 2 or len(envelopes) != len(tracks_meta):
        return transcript

    speakers = [
        {
            "id": str(m.get("label") or _label(i)),
            "label": str(m.get("label") or _label(i)),
            "display_name": str(m.get("speaker_name") or m.get("label") or _label(i)),
            "color_idx": int(m.get("index") if m.get("index") is not None else i),
        }
        for i, m in enumerate(tracks_meta)
    ]
    labels = [s["label"] for s in speakers]
    n_frames = max((len(e) for e in envelopes), default=0)

    raw_words = [dict(w) for w in (transcript.get("words") or []) if isinstance(w, dict)]
    # Pre-assign each word to a track by energy at its midpoint.
    for w in raw_words:
        mid = (int(w.get("start_ms") or 0) + int(w.get("end_ms") or 0)) // 2
        fr = _frame_range(mid, mid + 1, n_frames, hz=hz)
        energies = [_mean_energy(env, fr) for env in envelopes]
        w["speaker_id"] = labels[_argmax(energies)]

    raw_segs = [dict(s) for s in (transcript.get("segments") or []) if isinstance(s, dict)]
    out_segs: list[dict[str, Any]] = []

    for seg in raw_segs:
        start = int(seg.get("start_ms") or 0)
        end = int(seg.get("end_ms") or start)
        fr = _frame_range(start, end, n_frames, hz=hz)
        energies = [_mean_energy(env, fr) for env in envelopes]
        ov = _overlap_ratio(envelopes, fr)

        seg_words = [
            w
            for w in raw_words
            if int(w.get("start_ms") or 0) >= start and int(w.get("end_ms") or 0) <= end + 50
        ]

        if ov >= OVERLAP_RATIO and len(seg_words) >= 2:
            out_segs.extend(_split_seg_by_words(seg, seg_words, labels))
        else:
            label = labels[_argmax(energies)]
            out_segs.append(
                {
                    "id": seg.get("id"),
                    "speaker_id": label,
                    "start_ms": start,
                    "end_ms": end,
                    "text": str(seg.get("text") or "").strip(),
                }
            )
            for w in seg_words:
                w["speaker_id"] = label

    out_segs.sort(key=lambda s: (s["start_ms"], s["end_ms"], s["speaker_id"]))
    for i, seg in enumerate(out_segs, start=1):
        seg["id"] = f"S{i}"
    raw_words.sort(key=lambda w: (int(w.get("start_ms") or 0), int(w.get("end_ms") or 0)))

    return {
        **transcript,
        "speakers": speakers,
        "segments": out_segs,
        "words": raw_words,
        "multi_file": True,
        "energy_speakers": True,
    }


def _split_seg_by_words(
    seg: dict[str, Any],
    words: list[dict[str, Any]],
    labels: list[str],
) -> list[dict[str, Any]]:
    """Group consecutive words with the same energy-assigned speaker."""
    if not words:
        return [
            {
                "id": seg.get("id"),
                "speaker_id": labels[0],
                "start_ms": int(seg.get("start_ms") or 0),
                "end_ms": int(seg.get("end_ms") or 0),
                "text": str(seg.get("text") or "").strip(),
            }
        ]
    groups: list[dict[str, Any]] = []
    cur_label = str(words[0].get("speaker_id") or labels[0])
    cur_words: list[dict[str, Any]] = [words[0]]
    for w in words[1:]:
        lab = str(w.get("speaker_id") or labels[0])
        if lab == cur_label:
            cur_words.append(w)
        else:
            groups.append(_words_to_seg(cur_words, cur_label))
            cur_label = lab
            cur_words = [w]
    groups.append(_words_to_seg(cur_words, cur_label))
    return groups


def _words_to_seg(words: list[dict[str, Any]], label: str) -> dict[str, Any]:
    return {
        "id": "tmp",
        "speaker_id": label,
        "start_ms": int(words[0].get("start_ms") or 0),
        "end_ms": int(words[-1].get("end_ms") or 0),
        "text": " ".join(str(w.get("text") or "") for w in words).strip(),
    }


def _label(i: int) -> str:
    if i < 26:
        return chr(ord("A") + i)
    return f"S{i + 1}"
