from __future__ import annotations

from typing import Any

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


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
