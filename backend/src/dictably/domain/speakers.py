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
