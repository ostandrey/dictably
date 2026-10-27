from __future__ import annotations

import asyncio

import pytest
from arq import create_pool
from arq.worker import Worker

from dictably.core.config import get_settings
from dictably.worker.settings import redis_settings
from dictably.worker.tasks import ping, smoke_providers


@pytest.mark.asyncio
async def test_ping_job_through_queue() -> None:
    """Enqueue ping and process with an in-process burst worker (T-002 AC)."""
    get_settings.cache_clear()
    settings = redis_settings()
    redis = await create_pool(settings)
    try:
        job = await redis.enqueue_job("ping", "hello-t002")
        assert job is not None

        worker = Worker(
            functions=[ping, smoke_providers],
            redis_settings=settings,
            max_jobs=1,
            keep_result=30,
            burst=True,
        )
        await asyncio.wait_for(worker.async_run(), timeout=15)
        result = await job.result(timeout=5)
        assert result == {"echo": "hello-t002"}
    finally:
        await redis.aclose()


@pytest.mark.asyncio
async def test_smoke_providers_job() -> None:
    get_settings.cache_clear()
    settings = redis_settings()
    redis = await create_pool(settings)
    try:
        job = await redis.enqueue_job("smoke_providers")
        assert job is not None
        worker = Worker(
            functions=[ping, smoke_providers],
            redis_settings=settings,
            max_jobs=1,
            keep_result=30,
            burst=True,
        )
        await asyncio.wait_for(worker.async_run(), timeout=15)
        result = await job.result(timeout=5)
        assert result["asr"] == "fake"
        assert result["llm"] == "fake"
        assert result["segments"] >= 1
    finally:
        await redis.aclose()
