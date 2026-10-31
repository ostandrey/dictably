from __future__ import annotations

from typing import Any
from uuid import UUID

from arq.connections import ArqRedis

from dictably.core.logging import get_logger
from dictably.domain import process as process_domain
from dictably.providers.factory import get_asr_provider, get_llm_provider

log = get_logger(__name__)


async def ping(_ctx: dict[str, Any], message: str = "pong") -> dict[str, str]:
    """Smoke job — proves Redis queue + worker end-to-end (T-002 AC)."""
    log.info("worker.ping", message=message)
    return {"echo": message}


async def smoke_providers(_ctx: dict[str, Any]) -> dict[str, Any]:
    """Exercise fake ASR + LLM without touching paid APIs."""
    asr = get_asr_provider()
    llm = get_llm_provider()
    transcript = await asr.transcribe(audio_path="fixture://smoke")
    minutes = await llm.analyze(transcript=transcript)
    return {
        "asr": asr.name,
        "llm": llm.name,
        "segments": len(transcript.get("segments", [])),
        "agreements": len(minutes.get("agreements", [])),
    }


async def process_media(
    _ctx: dict[str, Any],
    media_id: str,
    job_id: str | None = None,
) -> dict[str, str]:
    """T-013/14: ffmpeg → ASR → ready (arq retries via max_tries)."""
    mid = UUID(media_id)
    jid = UUID(job_id) if job_id else None
    await process_domain.run_process_media(media_id=mid, job_id=jid)
    return {"media_id": media_id, "status": "ok"}


async def purge_expired_originals(_ctx: dict[str, Any]) -> dict[str, Any]:
    """T-038: drop originals after retention when playback copy exists."""
    from dictably.core.config import get_settings
    from dictably.db.session import get_session_factory
    from dictably.domain import media as media_domain
    from dictably.providers.factory import get_storage_provider

    settings = get_settings()
    factory = get_session_factory(settings)
    storage = get_storage_provider(settings)
    async with factory() as session:
        n = await media_domain.purge_expired_originals(
            session, storage, retention_days=settings.original_retention_days
        )
    return {"purged": n}


async def fair_queue_tick(_ctx: dict[str, Any]) -> dict[str, Any]:
    """T-038 B1: start waiting jobs; fail stale dispatched/running."""
    from dictably.core.config import get_settings
    from dictably.db.session import get_session_factory

    settings = get_settings()
    factory = get_session_factory(settings)
    async with factory() as session:
        return await process_domain.fair_queue_maintenance(session, settings=settings)


async def ops_alert_tick(_ctx: dict[str, Any]) -> dict[str, Any]:
    """T-038 B4: check queue / error thresholds every 5 minutes."""
    from dictably.domain import ops as ops_domain

    return await ops_domain.cron_ops_check()


async def abandon_uploads_tick(_ctx: dict[str, Any]) -> dict[str, Any]:
    """T-038 S1: abort uploading rows older than 24h."""
    from dictably.core.config import get_settings
    from dictably.db.session import get_session_factory
    from dictably.domain import media as media_domain
    from dictably.providers.factory import get_storage_provider

    settings = get_settings()
    factory = get_session_factory(settings)
    storage = get_storage_provider(settings)
    async with factory() as session:
        n = await media_domain.abandon_stale_uploads(session, storage)
    return {"abandoned": n}


async def enqueue_ping(redis: ArqRedis, message: str = "pong") -> str:
    job = await redis.enqueue_job("ping", message)
    assert job is not None
    return job.job_id
