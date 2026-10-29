"""Word edit + minutes quote sync (T-035)."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Media, Transcript
from dictably.domain import analysis as analysis_domain


async def edit_word(
    session: AsyncSession,
    *,
    media_id: UUID,
    word_index: int,
    text: str,
) -> Transcript:
    """Replace one word by index; rebuild segment text; patch minutes quotes/text."""
    tr = await session.get(Transcript, media_id)
    if tr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    words = list(tr.words or [])
    if word_index < 0 or word_index >= len(words):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="word_index out of range",
        )
    new_text = (text or "").strip()
    if not new_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="text required",
        )
    old = dict(words[word_index])
    old_text = str(old.get("text") or "")
    if old_text == new_text:
        return tr

    words[word_index] = {**old, "text": new_text}
    tr.words = words

    # Rebuild segment text that contains this word's time range.
    start_ms = int(old.get("start_ms") or 0)
    end_ms = int(old.get("end_ms") or start_ms)
    segments = list(tr.segments or [])
    for i, seg in enumerate(segments):
        s0 = int(seg.get("start_ms") or 0)
        s1 = int(seg.get("end_ms") or s0)
        if start_ms >= s0 - 5 and end_ms <= s1 + 5:
            seg_words = [
                w
                for w in words
                if int(w.get("start_ms") or 0) >= s0 - 5 and int(w.get("end_ms") or 0) <= s1 + 5
            ]
            if seg_words:
                segments[i] = {
                    **seg,
                    "text": " ".join(str(w.get("text") or "") for w in seg_words).strip(),
                }
            else:
                segments[i] = {
                    **seg,
                    "text": _replace_first_token(str(seg.get("text") or ""), old_text, new_text),
                }
            break
    tr.segments = segments

    # Patch latest analysis quotes/text without regenerating.
    row = await analysis_domain.get_latest(session, media_id)
    if row is not None and old_text:
        patched = _patch_minutes_word(dict(row.result or {}), old_text, new_text)
        if patched != row.result:
            row.result = patched
    await session.flush()
    return tr


def _replace_first_token(haystack: str, old: str, new: str) -> str:
    if not old:
        return haystack
    pattern = re.compile(re.escape(old), re.IGNORECASE)
    return pattern.sub(new, haystack, count=1)


def _patch_minutes_word(result: dict[str, Any], old: str, new: str) -> dict[str, Any]:
    out = dict(result)
    keys = (
        "summary",
        "decisions",
        "agreements",
        "tasks",
        "deadlines_and_facts",
        "open_questions",
    )
    for key in keys:
        items = out.get(key)
        if not isinstance(items, list):
            continue
        patched_items = []
        for item in items:
            if not isinstance(item, dict):
                patched_items.append(item)
                continue
            it = dict(item)
            for field in ("text", "quote"):
                val = it.get(field)
                if isinstance(val, str) and old.lower() in val.lower():
                    it[field] = _replace_first_token(val, old, new)
            patched_items.append(it)
        out[key] = patched_items
    return out


async def set_meeting_date(
    session: AsyncSession,
    *,
    media: Media,
    meeting_date: date,
) -> Media:
    """Update meeting_date and shift ISO due_date on tasks by the same delta."""
    old = media.meeting_date
    media.meeting_date = meeting_date
    if old is None or old == meeting_date:
        await session.flush()
        return media
    delta = meeting_date - old
    row = await analysis_domain.get_latest(session, media.id)
    if row is not None:
        patched = _shift_due_dates(dict(row.result or {}), delta)
        if patched != row.result:
            row.result = patched
    await session.flush()
    return media


def _shift_due_dates(result: dict[str, Any], delta: timedelta) -> dict[str, Any]:
    out = dict(result)
    tasks = out.get("tasks")
    if not isinstance(tasks, list):
        return out
    new_tasks = []
    for t in tasks:
        if not isinstance(t, dict):
            new_tasks.append(t)
            continue
        it = dict(t)
        raw = it.get("due_date")
        if isinstance(raw, str) and len(raw) >= 10:
            try:
                d = date.fromisoformat(raw[:10])
                it["due_date"] = (d + delta).isoformat()
            except ValueError:
                pass
        new_tasks.append(it)
    out["tasks"] = new_tasks
    return out
