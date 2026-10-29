"""Compare predicted minutes to a gold standard."""

from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


def _items(result: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key in ("agreements", "tasks", "decisions"):
        for it in result.get(key) or []:
            if isinstance(it, dict) and it.get("text"):
                row = dict(it)
                row["_kind"] = key
                out.append(row)
    return out


def _best_match(
    gold: dict[str, Any], predicted: list[dict[str, Any]], *, used: set[int]
) -> tuple[int | None, float]:
    g = _norm(str(gold.get("text") or ""))
    best_i: int | None = None
    best = 0.0
    for i, p in enumerate(predicted):
        if i in used:
            continue
        ratio = SequenceMatcher(None, g, _norm(str(p.get("text") or ""))).ratio()
        if ratio > best:
            best = ratio
            best_i = i
    return best_i, best


def score_case(
    gold: dict[str, Any],
    predicted: dict[str, Any],
    *,
    match_threshold: float = 0.72,
) -> dict[str, Any]:
    g_items = _items(gold)
    p_items = _items(predicted)
    used: set[int] = set()
    found = 0
    party_ok = 0
    party_n = 0
    link_ok = 0
    link_n = 0
    fabricated = 0

    for g in g_items:
        i, ratio = _best_match(g, p_items, used=used)
        if i is None or ratio < match_threshold:
            continue
        used.add(i)
        found += 1
        p = p_items[i]
        if g.get("party_id"):
            party_n += 1
            if p.get("party_id") == g.get("party_id"):
                party_ok += 1
        g_segs = {str(x) for x in (g.get("segment_ids") or [])}
        p_segs = {str(x) for x in (p.get("segment_ids") or [])}
        if g_segs:
            link_n += 1
            # ±1 neighbor tolerance: any overlap counts.
            if g_segs & p_segs:
                link_ok += 1

    for i, p in enumerate(p_items):
        if i in used:
            continue
        # Unmatched predicted with verify=supported counts as fabricated risk.
        if (p.get("verify") or "supported") == "supported":
            fabricated += 1

    return {
        "gold": len(g_items),
        "predicted": len(p_items),
        "found": found,
        "found_rate": (found / len(g_items)) if g_items else 1.0,
        "fabricated": fabricated,
        "party_accuracy": (party_ok / party_n) if party_n else 1.0,
        "link_accuracy": (link_ok / link_n) if link_n else 1.0,
    }
