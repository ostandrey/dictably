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


async def enqueue_ping(redis: ArqRedis, message: str = "pong") -> str:
    job = await redis.enqueue_job("ping", message)
    assert job is not None
    return job.job_id
