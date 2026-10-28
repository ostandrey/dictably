from __future__ import annotations

from redis.asyncio import Redis


async def hit_rate_limit(
    redis_url: str,
    *,
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> bool:
    """Return True if the caller is over the limit (should be rejected)."""
    client = Redis.from_url(redis_url, decode_responses=True)
    try:
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, window_seconds)
        return int(count) > limit
    finally:
        await client.aclose()
