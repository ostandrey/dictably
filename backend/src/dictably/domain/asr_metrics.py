"""WER / DER helpers for ASR quality eval (T-035)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_WORD_RE = re.compile(r"[\w']+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(text or "")]


def wer(reference: str, hypothesis: str) -> float:
    """Word error rate (Levenshtein on tokens). 0 = perfect, 1 = all wrong."""
    ref = tokenize(reference)
    hyp = tokenize(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    # DP edit distance
    n, m = len(ref), len(hyp)
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            cur[j] = min(
                prev[j] + 1,  # deletion
                cur[j - 1] + 1,  # insertion
                prev[j - 1] + cost,  # substitution
            )
        prev = cur
    return prev[m] / n


@dataclass(frozen=True)
class DerResult:
    der: float
    speaker_error: float
    missed_speech: float
    false_alarm: float


def _overlap_ms(a0: int, a1: int, b0: int, b1: int) -> int:
    return max(0, min(a1, b1) - max(a0, b0))


def der(
    reference: list[dict[str, Any]],
    hypothesis: list[dict[str, Any]],
) -> DerResult:
    """Simple DER on labeled segments: speaker_error + miss + FA over total ref speech.

    Each item: {start_ms, end_ms, speaker_id}. Optimal speaker mapping by greedy overlap.
    """
    ref = [
        {
            "start_ms": int(s["start_ms"]),
            "end_ms": int(s["end_ms"]),
            "speaker_id": str(s.get("speaker_id") or ""),
        }
        for s in reference
        if int(s.get("end_ms") or 0) > int(s.get("start_ms") or 0)
    ]
    hyp = [
        {
            "start_ms": int(s["start_ms"]),
            "end_ms": int(s["end_ms"]),
            "speaker_id": str(s.get("speaker_id") or ""),
        }
        for s in hypothesis
        if int(s.get("end_ms") or 0) > int(s.get("start_ms") or 0)
    ]
    total_ref = sum(s["end_ms"] - s["start_ms"] for s in ref) or 1

    # Build speaker map hyp→ref by max overlap.
    ref_labels = sorted({s["speaker_id"] for s in ref})
    hyp_labels = sorted({s["speaker_id"] for s in hyp})
    overlap: dict[tuple[str, str], int] = {}
    for r in ref:
        for h in hyp:
            key = (h["speaker_id"], r["speaker_id"])
            overlap[key] = overlap.get(key, 0) + _overlap_ms(
                r["start_ms"], r["end_ms"], h["start_ms"], h["end_ms"]
            )
    mapping: dict[str, str] = {}
    used_ref: set[str] = set()
    for hl in sorted(
        hyp_labels, key=lambda h: -max((overlap.get((h, r), 0) for r in ref_labels), default=0)
    ):
        best_r = None
        best_v = -1
        for rl in ref_labels:
            if rl in used_ref:
                continue
            v = overlap.get((hl, rl), 0)
            if v > best_v:
                best_v = v
                best_r = rl
        if best_r is not None:
            mapping[hl] = best_r
            used_ref.add(best_r)

    speaker_err = 0
    missed = 0
    for r in ref:
        covered = 0
        matched = 0
        for h in hyp:
            ov = _overlap_ms(r["start_ms"], r["end_ms"], h["start_ms"], h["end_ms"])
            if ov <= 0:
                continue
            covered += ov
            mapped = mapping.get(h["speaker_id"])
            if mapped == r["speaker_id"]:
                matched += ov
            else:
                speaker_err += ov
        missed += max(0, (r["end_ms"] - r["start_ms"]) - covered)

    false_alarm = 0
    for h in hyp:
        covered = 0
        for r in ref:
            covered += _overlap_ms(r["start_ms"], r["end_ms"], h["start_ms"], h["end_ms"])
        false_alarm += max(0, (h["end_ms"] - h["start_ms"]) - covered)

    return DerResult(
        der=(speaker_err + missed + false_alarm) / total_ref,
        speaker_error=speaker_err / total_ref,
        missed_speech=missed / total_ref,
        false_alarm=false_alarm / total_ref,
    )


def score_pair(
    *,
    ref_text: str,
    hyp_text: str,
    ref_segments: list[dict[str, Any]],
    hyp_segments: list[dict[str, Any]],
) -> dict[str, float]:
    d = der(ref_segments, hyp_segments)
    return {
        "wer": wer(ref_text, hyp_text),
        "der": d.der,
        "speaker_error": d.speaker_error,
        "missed_speech": d.missed_speech,
        "false_alarm": d.false_alarm,
    }
