"""Speaker rename / party assignment (T-015)."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Speaker

ALLOWED_PARTIES = frozenset({"our", "their"})


async def list_for_media(session: AsyncSession, media_id: UUID) -> list[Speaker]:
    result = await session.execute(
        select(Speaker)
        .where(Speaker.media_id == media_id)
        .order_by(Speaker.color_idx, Speaker.label)
    )
    return list(result.scalars().all())


async def count_for_media(session: AsyncSession, media_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(Speaker).where(Speaker.media_id == media_id)
    )
    return int(result.scalar_one())


async def get_for_media(session: AsyncSession, *, media_id: UUID, speaker_id: UUID) -> Speaker:
    row = await session.get(Speaker, speaker_id)
    if row is None or row.media_id != media_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


async def patch_speaker(
    session: AsyncSession,
    *,
    media_id: UUID,
    speaker_id: UUID,
    display_name: str | None,
    party: str | None,
    set_display_name: bool,
    set_party: bool,
) -> Speaker:
    row = await get_for_media(session, media_id=media_id, speaker_id=speaker_id)
    if set_display_name:
        name = (display_name or "").strip()
        row.display_name = name or row.label
    if set_party:
        if party is None or party == "":
            row.party = None
        elif party not in ALLOWED_PARTIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="party must be 'our', 'their', or null",
            )
        else:
            row.party = party
    await session.flush()
    return row


async def merge_speakers(
    session: AsyncSession,
    *,
    media_id: UUID,
    keep_id: UUID,
    merge_ids: list[UUID],
) -> list[Speaker]:
    """Merge merge_ids into keep_id: re-label segments/words, delete merged rows."""
    from dictably.db.models import Transcript

    keep = await get_for_media(session, media_id=media_id, speaker_id=keep_id)
    merge_rows: list[Speaker] = []
    for mid in merge_ids:
        if mid == keep_id:
            continue
        merge_rows.append(await get_for_media(session, media_id=media_id, speaker_id=mid))
    if not merge_rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="merge_ids required",
        )

    old_labels = {r.label for r in merge_rows}
    keep_label = keep.label

    tr = await session.get(Transcript, media_id)
    if tr is not None:
        segments = []
        for seg in tr.segments or []:
            s = dict(seg)
            if str(s.get("speaker_id") or "") in old_labels:
                s["speaker_id"] = keep_label
            segments.append(s)
        words = []
        for w in tr.words or []:
            ww = dict(w)
            if str(ww.get("speaker_id") or "") in old_labels:
                ww["speaker_id"] = keep_label
            words.append(ww)
        # Merge adjacent same-speaker segments.
        tr.segments = _coalesce_segments(segments)
        tr.words = words

    for row in merge_rows:
        await session.delete(row)
    await session.flush()
    return await list_for_media(session, media_id)


def _coalesce_segments(segments: list[dict]) -> list[dict]:
    if not segments:
        return []
    out: list[dict] = []
    for seg in segments:
        if (
            out
            and out[-1].get("speaker_id") == seg.get("speaker_id")
            and int(seg.get("start_ms") or 0) - int(out[-1].get("end_ms") or 0) <= 800
        ):
            prev = dict(out[-1])
            prev["end_ms"] = int(seg.get("end_ms") or prev.get("end_ms") or 0)
            prev["text"] = f"{prev.get('text') or ''} {seg.get('text') or ''}".strip()
            out[-1] = prev
        else:
            out.append(dict(seg))
    for i, seg in enumerate(out, start=1):
        seg["id"] = f"S{i}"
    return out


async def reassign_segment_speaker(
    session: AsyncSession,
    *,
    media_id: UUID,
    segment_id: str,
    speaker_id: UUID,
) -> None:
    """Change speaker for one segment (+ overlapping words)."""
    from dictably.db.models import Transcript

    sp = await get_for_media(session, media_id=media_id, speaker_id=speaker_id)
    tr = await session.get(Transcript, media_id)
    if tr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    segments = list(tr.segments or [])
    found = None
    for i, seg in enumerate(segments):
        if str(seg.get("id")) == segment_id:
            found = i
            break
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    seg = dict(segments[found])
    s0 = int(seg.get("start_ms") or 0)
    s1 = int(seg.get("end_ms") or s0)
    seg["speaker_id"] = sp.label
    segments[found] = seg
    words = []
    for w in tr.words or []:
        ww = dict(w)
        w0 = int(ww.get("start_ms") or 0)
        w1 = int(ww.get("end_ms") or w0)
        if w0 >= s0 - 5 and w1 <= s1 + 5:
            ww["speaker_id"] = sp.label
        words.append(ww)
    tr.segments = segments
    tr.words = words
    await session.flush()


def _next_speaker_label(existing: list[Speaker]) -> str:
    used = {s.label for s in existing}
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if ch not in used:
            return ch
    return f"S{len(existing) + 1}"


async def split_segment_to_new_speaker(
    session: AsyncSession,
    *,
    media_id: UUID,
    segment_id: str,
) -> Speaker:
    """Create a new speaker and assign this segment (+ words) to them (T-035 S1)."""
    existing = await list_for_media(session, media_id)
    label = _next_speaker_label(existing)
    color = max((s.color_idx for s in existing), default=-1) + 1
    sp = Speaker(
        media_id=media_id,
        label=label,
        display_name=f"Speaker {label}",
        color_idx=color,
    )
    session.add(sp)
    await session.flush()
    await reassign_segment_speaker(
        session, media_id=media_id, segment_id=segment_id, speaker_id=sp.id
    )
    return sp
