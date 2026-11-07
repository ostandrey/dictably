from __future__ import annotations

import logging
import time
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import Settings

logger = logging.getLogger(__name__)

# Avoid hitting the LLM gateway on every /health poll (ops + e2e).
_LLM_PROBE_TTL_S = 300.0
_llm_probe_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def check_database(session: AsyncSession) -> dict[str, Any]:
    await session.execute(text("SELECT 1"))
    return {"ok": True}


async def check_redis(redis_url: str) -> dict[str, Any]:
    client = Redis.from_url(redis_url, decode_responses=True)
    try:
        pong = await client.ping()
        return {"ok": bool(pong)}
    finally:
        await client.aclose()


def public_llm_check(full: dict[str, Any]) -> dict[str, Any]:
    """T-051 S2: strip provider detail from public /health (Ops keeps full)."""
    out = {
        "ok": bool(full.get("ok")),
        "provider": full.get("provider"),
        "model": full.get("model"),
    }
    if full.get("error"):
        out["error"] = full["error"]
    return out


async def check_llm(settings: Settings) -> dict[str, Any]:
    """T-051: report whether the configured minutes model is reachable (full, for Ops)."""
    provider = (settings.llm_provider or "fake").strip().lower()
    if provider == "fake":
        return {"ok": True, "provider": "fake", "model": "fake"}

    model = (
        settings.assemblyai_llm_model
        if provider in {"assemblyai_gateway", "assemblyai-llm", "lemur"}
        else settings.anthropic_model
    )
    cache_key = f"{provider}:{model}:{settings.assemblyai_llm_region}"
    now = time.monotonic()
    cached = _llm_probe_cache.get(cache_key)
    if cached and now - cached[0] < _LLM_PROBE_TTL_S:
        return dict(cached[1])

    result = await _probe_llm(settings, provider=provider, model=model)
    if not result.get("ok") and result.get("detail"):
        logger.warning(
            "llm health probe failed provider=%s model=%s error=%s detail=%s",
            result.get("provider"),
            result.get("model"),
            result.get("error"),
            result.get("detail"),
        )
    _llm_probe_cache[cache_key] = (now, result)
    return dict(result)


async def _probe_llm(settings: Settings, *, provider: str, model: str) -> dict[str, Any]:
    if provider in {"assemblyai_gateway", "assemblyai-llm", "lemur"}:
        return await _probe_assemblyai_gateway(settings, model=model)
    if provider == "anthropic":
        return await _probe_anthropic(settings, model=model)
    return {"ok": False, "provider": provider, "model": model, "error": "unsupported"}


async def _probe_assemblyai_gateway(settings: Settings, *, model: str) -> dict[str, Any]:
    import httpx

    from dictably.providers.llm.assemblyai_gateway import GATEWAY_HOSTS

    key = (settings.assemblyai_api_key or "").strip()
    if not key:
        return {
            "ok": False,
            "provider": "assemblyai_gateway",
            "model": model,
            "error": "missing_api_key",
        }
    region = (settings.assemblyai_llm_region or "eu").strip().lower()
    url = GATEWAY_HOSTS.get(region) or GATEWAY_HOSTS["eu"]
    body = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                url,
                headers={"authorization": key, "content-type": "application/json"},
                json=body,
            )
        if res.status_code < 400:
            return {"ok": True, "provider": "assemblyai_gateway", "model": model}
        text_body = (res.text or "")[:240]
        return {
            "ok": False,
            "provider": "assemblyai_gateway",
            "model": model,
            "error": f"http_{res.status_code}",
            "detail": text_body,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("llm health probe failed: %s", exc)
        return {
            "ok": False,
            "provider": "assemblyai_gateway",
            "model": model,
            "error": type(exc).__name__,
        }


async def _probe_anthropic(settings: Settings, *, model: str) -> dict[str, Any]:
    import httpx

    key = (settings.anthropic_api_key or "").strip()
    if not key:
        return {
            "ok": False,
            "provider": "anthropic",
            "model": model,
            "error": "missing_api_key",
        }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "ping"}],
                },
            )
        if res.status_code < 400:
            return {"ok": True, "provider": "anthropic", "model": model}
        return {
            "ok": False,
            "provider": "anthropic",
            "model": model,
            "error": f"http_{res.status_code}",
            "detail": (res.text or "")[:240],
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("anthropic health probe failed: %s", exc)
        return {
            "ok": False,
            "provider": "anthropic",
            "model": model,
            "error": type(exc).__name__,
        }
