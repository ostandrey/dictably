"""Transcript preparation for minutes LLM (AI-PIPELINE §1) — code only, no model."""

from __future__ import annotations

from typing import Any


def _speaker_key(seg: dict[str, Any]) -> str:
    return str(seg.get("speaker_id") or seg.get("speaker") or "?")


def merge_consecutive_segments(
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge adjacent same-speaker turns; keep first id + joined text for quotes.

    Original segment ids that were folded in are listed under ``merged_ids`` so
    evidence still resolves when the model cites any of them.
    """
    if not segments:
        return []
    out: list[dict[str, Any]] = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        sid = str(seg.get("id") or "")
        if not sid:
            continue
        text = str(seg.get("text") or "").strip()
        if out and _speaker_key(out[-1]) == _speaker_key(seg):
            prev = out[-1]
            merged = list(prev.get("merged_ids") or [str(prev["id"])])
            merged.append(sid)
            prev["merged_ids"] = merged
            prev["text"] = f"{prev.get('text') or ''} {text}".strip()
            end = seg.get("end_ms")
            if end is not None:
                prev["end_ms"] = end
            continue
        row = dict(seg)
        row["id"] = sid
        row["text"] = text
        row["merged_ids"] = [sid]
        out.append(row)
    return out


def speaker_display(
    label: str,
    speakers: list[dict[str, Any]] | None,
) -> str:
    if not speakers:
        return label
    for sp in speakers:
        sp_label = str(sp.get("label") or sp.get("id") or "")
        if sp_label != label and str(sp.get("id") or "") != label:
            continue
        name = (sp.get("display_name") or "").strip() or sp_label or label
        party = (sp.get("party") or "").strip()
        if party:
            return f"{name} ({party})"
        return name
    return label


def format_transcript_lines(
    segments: list[dict[str, Any]],
    *,
    speakers: list[dict[str, Any]] | None = None,
    merge: bool = True,
) -> str:
    rows = merge_consecutive_segments(segments) if merge else list(segments)
    lines: list[str] = []
    for seg in rows:
        start_ms = int(seg.get("start_ms") or 0)
        mm = start_ms // 60000
        ss = (start_ms % 60000) // 1000
        stamp = f"{mm:02d}:{ss:02d}"
        sid = str(seg.get("id") or "")
        raw_speaker = _speaker_key(seg)
        speaker = speaker_display(raw_speaker, speakers)
        text = str(seg.get("text") or "")
        lines.append(f"[{sid} {stamp} {speaker}] {text}")
    return "\n".join(lines)


def meeting_card(
    *,
    language: str,
    duration_ms: int | None,
    parties: list[dict[str, Any]] | None,
    speakers: list[dict[str, Any]] | None,
    template: str = "default",
) -> str:
    parts = [f"Meeting language: {language}", f"Template: {template}"]
    if duration_ms is not None and duration_ms > 0:
        mins = max(1, round(duration_ms / 60_000))
        parts.append(f"Duration: ~{mins} min")
    assigned = [p for p in (parties or []) if p.get("id") and p.get("label")]
    if assigned:
        listed = ", ".join(f"{p['id']}={p['label']}" for p in assigned)
        parts.append(f"Assigned parties (prefer these labels): {listed}")
    if speakers:
        people = []
        for sp in speakers:
            label = str(sp.get("label") or sp.get("id") or "")
            name = (sp.get("display_name") or label).strip()
            party = (sp.get("party") or "").strip()
            bit = name if not party else f"{name} ({party})"
            people.append(bit)
        if people:
            parts.append("Participants: " + "; ".join(people))
    return "\n".join(parts)


def segment_lookup(
    segments: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Map every original/merged id → segment row (for quote checks + ±2 context)."""
    by_id: dict[str, dict[str, Any]] = {}
    for seg in segments:
        if not isinstance(seg, dict) or not seg.get("id"):
            continue
        sid = str(seg["id"])
        by_id[sid] = seg
    merged = merge_consecutive_segments(segments)
    for row in merged:
        for mid in row.get("merged_ids") or [str(row["id"])]:
            by_id[str(mid)] = row
    return by_id


def neighbor_context(
    segments: list[dict[str, Any]],
    segment_ids: list[str],
    *,
    radius: int = 2,
) -> list[dict[str, Any]]:
    """Segments cited plus ±radius neighbors (ordered, unique)."""
    if not segments:
        return []
    index = {str(s.get("id")): i for i, s in enumerate(segments) if s.get("id")}
    picks: set[int] = set()
    for sid in segment_ids:
        i = index.get(str(sid))
        if i is None:
            continue
        for j in range(max(0, i - radius), min(len(segments), i + radius + 1)):
            picks.add(j)
    return [segments[i] for i in sorted(picks)]
