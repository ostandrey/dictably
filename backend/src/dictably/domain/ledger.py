"""Credit ledger helpers (reserve / commit / release)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import CreditKind, CreditLedger, User


async def balance_seconds(session: AsyncSession, user_id: UUID) -> int:
    result = await session.execute(
        select(func.coalesce(func.sum(CreditLedger.delta_seconds), 0)).where(
            CreditLedger.user_id == user_id
        )
    )
    return int(result.scalar_one())


async def grant(
    session: AsyncSession,
    *,
    user_id: UUID,
    seconds: int,
    ref: str | None = None,
) -> CreditLedger:
    row = CreditLedger(
        user_id=user_id,
        delta_seconds=seconds,
        kind=CreditKind.grant,
        ref=ref,
    )
    session.add(row)
    await session.flush()
    return row


async def ensure_trial_grant(
    session: AsyncSession,
    *,
    user_id: UUID,
    seconds: int = 3 * 60 * 60,
) -> None:
    """MVP-0: one trial grant per user (idempotent via unique ref). Seconds from settings."""
    ref = f"mvp0-trial:{user_id}"
    existing = await session.execute(
        select(CreditLedger.id).where(
            CreditLedger.user_id == user_id,
            CreditLedger.kind == CreditKind.grant,
            CreditLedger.ref == ref,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return
    await grant(session, user_id=user_id, seconds=seconds, ref=ref)


async def _lock_user_credits(session: AsyncSession, user_id: UUID) -> None:
    """Serialize reserve/balance for one user (S3). Prefer row lock; advisory as fallback."""
    locked = await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    if locked.scalar_one_or_none() is not None:
        return
    # User row missing (shouldn't happen) — still serialize via advisory lock.
    key = int.from_bytes(user_id.bytes[:8], byteorder="big", signed=True)
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})


async def reserve(
    session: AsyncSession,
    *,
    user_id: UUID,
    seconds: int,
    ref: str,
) -> CreditLedger:
    await _lock_user_credits(session, user_id)
    bal = await balance_seconds(session, user_id)
    if bal < seconds:
        raise InsufficientCredits(needed=seconds, available=bal)
    row = CreditLedger(
        user_id=user_id,
        delta_seconds=-seconds,
        kind=CreditKind.reserve,
        ref=ref,
    )
    session.add(row)
    await session.flush()
    return row


async def release(
    session: AsyncSession,
    *,
    user_id: UUID,
    seconds: int,
    ref: str,
) -> CreditLedger | None:
    """Release a prior reserve (idempotent if release row already exists)."""
    release_ref = f"release:{ref}"
    existing = await session.execute(
        select(CreditLedger.id).where(
            CreditLedger.user_id == user_id,
            CreditLedger.kind == CreditKind.release,
            CreditLedger.ref == release_ref,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None
    row = CreditLedger(
        user_id=user_id,
        delta_seconds=seconds,
        kind=CreditKind.release,
        ref=release_ref,
    )
    session.add(row)
    await session.flush()
    return row


async def commit(
    session: AsyncSession,
    *,
    user_id: UUID,
    seconds: int,
    ref: str,
) -> CreditLedger | None:
    """Mark reserved seconds as spent (0 delta bookkeeping row for audit)."""
    commit_ref = f"commit:{ref}"
    existing = await session.execute(
        select(CreditLedger.id).where(
            CreditLedger.user_id == user_id,
            CreditLedger.kind == CreditKind.commit,
            CreditLedger.ref == commit_ref,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None
    row = CreditLedger(
        user_id=user_id,
        delta_seconds=0,
        kind=CreditKind.commit,
        ref=commit_ref,
    )
    session.add(row)
    await session.flush()
    return row


class InsufficientCredits(Exception):
    def __init__(self, *, needed: int, available: int) -> None:
        self.needed = needed
        self.available = available
        super().__init__(f"Need {needed}s, have {available}s")
