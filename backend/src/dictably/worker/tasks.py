from __future__ import annotations

from typing import Any

from arq.connections import ArqRedis

from dictably.core.logging import get_logger
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


async def enqueue_ping(redis: ArqRedis, message: str = "pong") -> str:
    job = await redis.enqueue_job("ping", message)
    assert job is not None
    return job.job_id
