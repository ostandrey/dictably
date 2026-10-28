"""Append-only audit log helpers (T-019)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import AuditLog


async def record(
    session: AsyncSession,
    *,
    user_id: UUID | None,
    action: str,
    target: str | None = None,
    ip: str | None = None,
) -> AuditLog:
    row = AuditLog(
        user_id=user_id,
        action=action[:64],
        target=(target[:256] if target else None),
        ip=(ip[:64] if ip else None),
    )
    session.add(row)
    await session.flush()
    return row
