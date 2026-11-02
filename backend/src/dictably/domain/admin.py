"""Admin listing, retry, grant, costs (T-019)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import Settings, get_settings
from dictably.db.models import (
    Analysis,
    CreditLedger,
    Job,
    JobStatus,
    Media,
    MediaStatus,
    User,
)
from dictably.domain import audit as audit_domain
from dictably.domain import ledger as ledger_domain
from dictably.domain import process as process_domain
from dictably.providers.storage.base import StorageProvider


def _escape_like(needle: str) -> str:
    return needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_users(session: AsyncSession) -> list[tuple[User, int]]:
    """Users with credit balance (seconds). Newest first."""
    bal = (
        select(
            CreditLedger.user_id.label("uid"),
            func.coalesce(func.sum(CreditLedger.delta_seconds), 0).label("balance"),
        )
        .group_by(CreditLedger.user_id)
        .subquery()
    )
    result = await session.execute(
        select(User, func.coalesce(bal.c.balance, 0))
        .outerjoin(bal, bal.c.uid == User.id)
        .order_by(User.created_at.desc(), User.id.desc())
    )
    return [(row[0], int(row[1])) for row in result.all()]


async def list_users_page(
    session: AsyncSession,
    *,
    limit: int = 50,
    cursor: str | None = None,
    q: str | None = None,
) -> tuple[list[tuple[User, int]], str | None]:
    """Cursor page of users (T-039). Optional email search."""
    from dictably.domain.cursor_page import (
        clamp_limit,
        decode_time_id_cursor,
        encode_time_id_cursor,
    )

    page_size = clamp_limit(limit, default=50, maximum=50)
    bal = (
        select(
            CreditLedger.user_id.label("uid"),
            func.coalesce(func.sum(CreditLedger.delta_seconds), 0).label("balance"),
        )
        .group_by(CreditLedger.user_id)
        .subquery()
    )
    stmt = select(User, func.coalesce(bal.c.balance, 0)).outerjoin(bal, bal.c.uid == User.id)
    needle = (q or "").strip()
    if needle:
        safe = _escape_like(needle)
        stmt = stmt.where(User.email.ilike(f"%{safe}%", escape="\\"))
    if cursor:
        c = decode_time_id_cursor(cursor)
        stmt = stmt.where(
            (User.created_at < c.created_at)
            | ((User.created_at == c.created_at) & (User.id < c.id))
        )
    stmt = stmt.order_by(User.created_at.desc(), User.id.desc()).limit(page_size + 1)
    rows = [(r[0], int(r[1])) for r in (await session.execute(stmt)).all()]
    next_cursor: str | None = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        last_user = rows[-1][0]
        next_cursor = encode_time_id_cursor(last_user.created_at, last_user.id)
    return rows, next_cursor


async def count_users(session: AsyncSession, *, q: str | None = None) -> int:
    stmt = select(func.count()).select_from(User)
    needle = (q or "").strip()
    if needle:
        safe = _escape_like(needle)
        stmt = stmt.where(User.email.ilike(f"%{safe}%", escape="\\"))
    return int((await session.execute(stmt)).scalar_one())


async def list_media(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    limit: int = 100,
) -> list[tuple[Media, str]]:
    """All recordings with owner email. Optional status filter."""
    q = (
        select(Media, User.email)
        .join(User, User.id == Media.user_id)
        .order_by(Media.created_at.desc(), Media.id.desc())
        .limit(min(max(limit, 1), 500))
    )
    if status_filter:
        q = q.where(Media.status == status_filter)
    result = await session.execute(q)
    return [(row[0], row[1]) for row in result.all()]


async def list_media_page(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    q: str | None = None,
) -> tuple[list[tuple[Media, str]], str | None]:
    from dictably.domain.cursor_page import (
        clamp_limit,
        decode_time_id_cursor,
        encode_time_id_cursor,
    )

    page_size = clamp_limit(limit, default=50, maximum=50)
    stmt = select(Media, User.email).join(User, User.id == Media.user_id)
    if status_filter:
        stmt = stmt.where(Media.status == status_filter)
    needle = (q or "").strip()
    if needle:
        safe = _escape_like(needle)
        stmt = stmt.where(User.email.ilike(f"%{safe}%", escape="\\"))
    if cursor:
        c = decode_time_id_cursor(cursor)
        stmt = stmt.where(
            (Media.created_at < c.created_at)
            | ((Media.created_at == c.created_at) & (Media.id < c.id))
        )
    stmt = stmt.order_by(Media.created_at.desc(), Media.id.desc()).limit(page_size + 1)
    rows = [(r[0], r[1]) for r in (await session.execute(stmt)).all()]
    next_cursor: str | None = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        last = rows[-1][0]
        next_cursor = encode_time_id_cursor(last.created_at, last.id)
    return rows, next_cursor


async def count_media(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    q: str | None = None,
) -> int:
    stmt = select(func.count()).select_from(Media).join(User, User.id == Media.user_id)
    if status_filter:
        stmt = stmt.where(Media.status == status_filter)
    needle = (q or "").strip()
    if needle:
        safe = _escape_like(needle)
        stmt = stmt.where(User.email.ilike(f"%{safe}%", escape="\\"))
    return int((await session.execute(stmt)).scalar_one())


async def list_jobs(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    limit: int = 100,
) -> list[Job]:
    q = select(Job).order_by(Job.created_at.desc(), Job.id.desc()).limit(min(max(limit, 1), 500))
    if status_filter:
        q = q.where(Job.status == status_filter)
    result = await session.execute(q)
    return list(result.scalars().all())


async def list_jobs_page(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    q: str | None = None,
) -> tuple[list[Job], str | None]:
    from dictably.domain.cursor_page import (
        clamp_limit,
        decode_time_id_cursor,
        encode_time_id_cursor,
    )

    page_size = clamp_limit(limit, default=50, maximum=50)
    stmt = select(Job)
    if status_filter:
        stmt = stmt.where(Job.status == status_filter)
    needle = (q or "").strip()
    if needle:
        safe = _escape_like(needle)
        # Jobs have no email — filter via media owner when q set.
        owner_ids = select(User.id).where(User.email.ilike(f"%{safe}%", escape="\\"))
        media_ids = select(Media.id).where(Media.user_id.in_(owner_ids))
        stmt = stmt.where(Job.media_id.in_(media_ids))
    if cursor:
        c = decode_time_id_cursor(cursor)
        stmt = stmt.where(
            (Job.created_at < c.created_at) | ((Job.created_at == c.created_at) & (Job.id < c.id))
        )
    stmt = stmt.order_by(Job.created_at.desc(), Job.id.desc()).limit(page_size + 1)
    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor: str | None = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        last = rows[-1]
        next_cursor = encode_time_id_cursor(last.created_at, last.id)
    return rows, next_cursor


async def count_jobs(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    q: str | None = None,
) -> int:
    stmt = select(func.count()).select_from(Job)
    if status_filter:
        stmt = stmt.where(Job.status == status_filter)
    needle = (q or "").strip()
    if needle:
        safe = _escape_like(needle)
        owner_ids = select(User.id).where(User.email.ilike(f"%{safe}%", escape="\\"))
        media_ids = select(Media.id).where(Media.user_id.in_(owner_ids))
        stmt = stmt.where(Job.media_id.in_(media_ids))
    return int((await session.execute(stmt)).scalar_one())


async def retry_job(
    session: AsyncSession,
    *,
    job_id: UUID,
    actor: User,
    ip: str | None,
    settings: Settings | None = None,
) -> Job:
    settings = settings or get_settings()
    job = await session.get(Job, job_id)
    if job is None or job.media_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    media = await session.get(Media, job.media_id)
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if job.status != JobStatus.failed and media.status != MediaStatus.failed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only failed jobs can be retried",
        )
    await audit_domain.record(
        session,
        user_id=actor.id,
        action="admin.job.retry",
        target=f"job:{job_id}",
        ip=ip,
    )
    await session.commit()
    return await process_domain.enqueue_or_run_process(
        session, media_id=media.id, settings=settings
    )


async def delete_media(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    media_id: UUID,
    actor: User,
    ip: str | None,
) -> None:
    """Hard-delete any user's recording (admin)."""
    media = await session.get(Media, media_id)
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if media.status in {
        MediaStatus.processing,
        MediaStatus.transcribing,
        MediaStatus.analyzing,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Wait until processing finishes",
        )
    keys = [str(v) for v in (media.storage_keys or {}).values() if v]
    for key in keys:
        try:
            await storage.delete(key)
        except Exception:  # noqa: BLE001
            pass
    await audit_domain.record(
        session,
        user_id=actor.id,
        action="admin.media.delete",
        target=f"media:{media_id}",
        ip=ip,
    )
    await session.execute(sa_delete(Media).where(Media.id == media.id))
    await session.commit()


async def grant_hours(
    session: AsyncSession,
    *,
    user_id: UUID,
    hours: float,
    actor: User,
    ip: str | None,
) -> CreditLedger:
    if hours <= 0 or hours > 1000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="hours must be between 0 and 1000",
        )
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    seconds = int(round(hours * 3600))
    ref = f"admin-grant:{actor.id}:{user_id}:{datetime.now(UTC).isoformat()}"
    row = await ledger_domain.grant(session, user_id=user_id, seconds=seconds, ref=ref[:128])
    await audit_domain.record(
        session,
        user_id=actor.id,
        action="admin.user.grant",
        target=f"user:{user_id}:{seconds}s",
        ip=ip,
    )
    await session.commit()
    await session.refresh(row)
    return row


async def costs_report(
    session: AsyncSession,
    *,
    period: str = "day",
) -> dict[str, float | str]:
    """Sum Analysis.cost_usd for day or month. GPU/API placeholders until metered."""
    now = datetime.now(UTC)
    if period == "month":
        since = now - timedelta(days=30)
        label = "month"
    else:
        since = now - timedelta(days=1)
        label = "day"
    llm = await session.execute(
        select(func.coalesce(func.sum(Analysis.cost_usd), 0.0)).where(Analysis.created_at >= since)
    )
    llm_usd = float(llm.scalar_one() or 0.0)
    return {
        "period": label,
        "since": since.isoformat(),
        "llm_usd": round(llm_usd, 4),
        "gpu_usd": 0.0,
        "api_usd": 0.0,
        "total_usd": round(llm_usd, 4),
    }


async def set_role_by_email(session: AsyncSession, *, email: str, role: str) -> User:
    result = await session.execute(select(User).where(User.email == email.lower().strip()))
    user = result.scalar_one_or_none()
    if user is None:
        raise LookupError(f"No user with email {email}")
    user.role = role
    await session.commit()
    await session.refresh(user)
    return user
