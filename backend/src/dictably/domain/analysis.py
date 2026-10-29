"""Minutes / analysis domain (T-016)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Analysis, Media, MediaStatus, Transcript
from dictably.domain import speakers as speakers_domain
from dictably.domain.minutes_pipeline import parse_minutes_result, run_minutes_pipeline
from dictably.domain.minutes_schema import Minutes
from dictably.providers.factory import get_llm_provider
from dictably.providers.llm.base import MinutesProvider

log = logging.getLogger(__name__)

MAX_ANALYSES_PER_MEDIA = 5
REGEN_HUMAN_ERROR = "Couldn't update the minutes. Try again in a minute."


class AnalysisError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        self.status_code = status_code
        super().__init__(message)


async def count_for_media(session: AsyncSession, media_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(Analysis).where(Analysis.media_id == media_id)
    )
    return int(result.scalar_one())


async def get_latest(session: AsyncSession, media_id: UUID) -> Analysis | None:
    result = await session.execute(
        select(Analysis)
        .where(Analysis.media_id == media_id)
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def run_and_store(
    session: AsyncSession,
    *,
    media: Media,
    transcript: Transcript,
    llm: MinutesProvider | None = None,
) -> Analysis:
    """Two-pass LLM + code validation; persist Analysis row (T-016a)."""
    llm = llm or get_llm_provider()
    speaker_rows = await speakers_domain.list_for_media(session, media.id)
    speakers_payload = [
        {
            "id": str(sp.id),
            "label": sp.label,
            "display_name": sp.display_name or sp.label,
            "party": sp.party,
            "color_idx": sp.color_idx,
        }
        for sp in speaker_rows
    ]
    # Prefer user-assigned parties (our/their) as seed labels for the LLM.
    party_labels = {"our": "Our side", "their": "Their side"}
    party_map: dict[str, str] = {}
    for sp in speaker_rows:
        if not sp.party:
            continue
        if sp.party not in party_map:
            party_map[sp.party] = party_labels.get(sp.party, sp.party)
    parties_payload = [{"id": pid, "label": label} for pid, label in party_map.items()]

    payload = {
        "language": transcript.language or media.language or "en",
        "segments": list(transcript.segments or []),
        "words": list(transcript.words or []),
        "speakers": speakers_payload,
        "parties": parties_payload,
    }
    raw = await run_minutes_pipeline(llm, transcript=payload, require_quote=True)
    dropped = list(raw.pop("_validation_dropped", []) or [])
    if dropped:
        log.info(
            "analysis.dropped media=%s count=%s sample=%s",
            media.id,
            len(dropped),
            dropped[:3],
        )
    cleaned = parse_minutes_result(raw)
    data = cleaned.model_dump()
    data["provider"] = data.get("provider") or getattr(llm, "name", "unknown")
    row = Analysis(
        media_id=media.id,
        template="default",
        provider=str(data["provider"]),
        model=data.get("model"),
        result=data,
        cost_usd=data.get("cost_usd"),
    )
    session.add(row)
    await session.flush()
    return row


async def regenerate_for_user(
    session: AsyncSession,
    *,
    user_id: UUID,
    media_id: UUID,
) -> Analysis:
    from dictably.domain import media as media_domain

    media = await media_domain.get_for_user(session, user_id, media_id)
    if media.status != MediaStatus.ready:
        raise AnalysisError("Recording is not ready yet.", status_code=409)
    transcript = await session.get(Transcript, media.id)
    if transcript is None:
        raise AnalysisError("Transcript not found.", status_code=404)
    n = await count_for_media(session, media.id)
    if n >= MAX_ANALYSES_PER_MEDIA:
        raise AnalysisError(
            f"Regeneration limit reached ({MAX_ANALYSES_PER_MEDIA}).",
            status_code=429,
        )
    media.status = MediaStatus.analyzing
    await session.flush()
    try:
        row = await run_and_store(session, media=media, transcript=transcript)
        media.status = MediaStatus.ready
        media.error = None
        await session.commit()
        await session.refresh(row)
        return row
    except Exception as exc:
        media.status = MediaStatus.ready
        media.error = None
        await session.commit()
        log.exception("analysis.regenerate_failed media=%s err=%s", media_id, exc)
        raise AnalysisError(REGEN_HUMAN_ERROR, status_code=502) from exc


def enrich_start_ms(
    result: dict[str, Any],
    segments: list[dict[str, Any]],
) -> dict[str, Any]:
    from dictably.domain.minutes_schema import point_start_ms

    out = dict(result)
    for key in (
        "summary",
        "decisions",
        "agreements",
        "tasks",
        "deadlines_and_facts",
        "open_questions",
    ):
        items = out.get(key) or []
        if not isinstance(items, list):
            continue
        enriched = []
        for item in items:
            if not isinstance(item, dict):
                continue
            row = dict(item)
            ids = [str(x) for x in (row.get("segment_ids") or [])]
            row["start_ms"] = point_start_ms(segments, ids)
            enriched.append(row)
        out[key] = enriched
    return out


async def to_out_payload(
    session: AsyncSession,
    row: Analysis,
    *,
    segments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    n = await count_for_media(session, row.media_id)
    segs = segments
    if segs is None:
        tr = await session.get(Transcript, row.media_id)
        segs = list((tr.segments if tr else None) or [])
    result = enrich_start_ms(dict(row.result or {}), segs)
    result.setdefault("provider", row.provider)
    result.setdefault("model", row.model)
    return {
        "id": row.id,
        "media_id": row.media_id,
        "provider": row.provider,
        "model": row.model,
        "created_at": row.created_at,
        "regenerations_left": max(0, MAX_ANALYSES_PER_MEDIA - n),
        "result": Minutes.model_validate(result).model_dump(),
    }
