"""Admin API — role=admin only; non-admin → 404 (T-019)."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.deps import client_ip, require_admin, require_admin_csrf
from dictably.api.schemas import (
    AdminCostsOut,
    AdminFunnelOut,
    AdminGrantIn,
    AdminJobListOut,
    AdminJobOut,
    AdminMediaListOut,
    AdminMediaOut,
    AdminOpsOut,
    AdminUserListOut,
    AdminUserOut,
)
from dictably.core.config import get_settings
from dictably.db.models import Job, User
from dictably.db.session import get_db
from dictably.domain import admin as admin_domain
from dictably.domain import analytics as analytics_domain
from dictably.domain import ops as ops_domain
from dictably.providers.factory import get_storage_provider

router = APIRouter(prefix="/admin", tags=["admin"])


def _job_out(job: Job) -> AdminJobOut:
    return AdminJobOut(
        id=job.id,
        media_id=job.media_id,
        kind=job.kind,
        status=job.status,
        attempts=job.attempts,
        last_error=job.last_error,
        created_at=job.created_at,
    )


@router.get("/users", response_model=AdminUserListOut)
async def admin_list_users(
    session: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> AdminUserListOut:
    rows = await admin_domain.list_users(session)
    return AdminUserListOut(
        items=[
            AdminUserOut(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role,
                locale=u.locale,
                created_at=u.created_at,
                balance_seconds=bal,
            )
            for u, bal in rows
        ]
    )


@router.get("/media", response_model=AdminMediaListOut)
async def admin_list_media(
    session: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> AdminMediaListOut:
    rows = await admin_domain.list_media(session, status_filter=status_filter)
    return AdminMediaListOut(
        items=[
            AdminMediaOut(
                id=m.id,
                user_id=m.user_id,
                owner_email=email,
                filename=m.filename,
                status=m.status,
                duration_ms=m.duration_ms,
                error=m.error,
                created_at=m.created_at,
            )
            for m, email in rows
        ]
    )


@router.get("/jobs", response_model=AdminJobListOut)
async def admin_list_jobs(
    session: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> AdminJobListOut:
    jobs = await admin_domain.list_jobs(session, status_filter=status_filter)
    return AdminJobListOut(items=[_job_out(j) for j in jobs])


@router.post("/jobs/{job_id}/retry", response_model=AdminJobOut)
async def admin_retry_job(
    job_id: UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin_csrf)],
) -> AdminJobOut:
    job = await admin_domain.retry_job(
        session,
        job_id=job_id,
        actor=actor,
        ip=client_ip(request),
        settings=get_settings(),
    )
    return _job_out(job)


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_media(
    media_id: UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin_csrf)],
) -> Response:
    await admin_domain.delete_media(
        session,
        get_storage_provider(),
        media_id=media_id,
        actor=actor,
        ip=client_ip(request),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/grant", response_model=AdminUserOut)
async def admin_grant(
    user_id: UUID,
    body: AdminGrantIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin_csrf)],
) -> AdminUserOut:
    await admin_domain.grant_hours(
        session,
        user_id=user_id,
        hours=body.hours,
        actor=actor,
        ip=client_ip(request),
    )
    rows = await admin_domain.list_users(session)
    for u, bal in rows:
        if u.id == user_id:
            return AdminUserOut(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role,
                locale=u.locale,
                created_at=u.created_at,
                balance_seconds=bal,
            )
    raise RuntimeError("user missing after grant")


@router.get("/costs", response_model=AdminCostsOut)
async def admin_costs(
    session: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    period: Annotated[Literal["day", "month"], Query()] = "day",
) -> AdminCostsOut:
    data = await admin_domain.costs_report(session, period=period)
    return AdminCostsOut(**data)


@router.get("/funnel", response_model=AdminFunnelOut)
async def admin_funnel(
    session: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    days: Annotated[int, Query(ge=7, le=30)] = 7,
) -> AdminFunnelOut:
    """Product funnel + UTM sources (T-034)."""
    window = 30 if days >= 30 else 7
    data = await analytics_domain.funnel_report(session, days=window)
    return AdminFunnelOut.model_validate(data)


@router.get("/ops", response_model=AdminOpsOut)
async def admin_ops(
    session: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
) -> AdminOpsOut:
    """Queue / errors / disk monitoring (T-038)."""
    data = await ops_domain.ops_report(session, settings=get_settings(), send_alerts=False)
    return AdminOpsOut.model_validate(data)
