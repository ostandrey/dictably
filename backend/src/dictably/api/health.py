from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import Settings, get_settings
from dictably.db.session import get_db
from dictably.domain import health as health_domain

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    response: Response,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    checks: dict[str, dict] = {}
    ok = True
    try:
        checks["database"] = await health_domain.check_database(session)
    except Exception as exc:  # noqa: BLE001 — surface in health payload
        ok = False
        checks["database"] = {"ok": False, "error": type(exc).__name__}
    try:
        checks["redis"] = await health_domain.check_redis(settings.redis_url)
    except Exception as exc:  # noqa: BLE001
        ok = False
        checks["redis"] = {"ok": False, "error": type(exc).__name__}

    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if ok else "degraded",
        "env": settings.env,
        "asr_provider": settings.asr_provider,
        "llm_provider": settings.llm_provider,
        "checks": checks,
    }
