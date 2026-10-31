"""Seed one MediaStatus.queued row for e2e (T-038 S4). Usage: email as argv[1]."""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from dictably.core.config import get_settings
from dictably.db.models import Media, MediaStatus, User
from dictably.db.session import get_session_factory, reset_engine


async def main(email: str) -> int:
    get_settings.cache_clear()
    await reset_engine()
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            print(f"user not found: {email}", file=sys.stderr)
            return 1
        m = Media(
            user_id=user.id,
            filename="waiting.m4a",
            status=MediaStatus.queued,
            storage_keys={},
        )
        session.add(m)
        await session.commit()
        print(m.id)
    return 0


if __name__ == "__main__":
    import os

    email = (sys.argv[1] if len(sys.argv) > 1 else "") or os.environ.get("SEED_QUEUED_EMAIL", "")
    if not email:
        print("usage: seed_queued.py <email>", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(asyncio.run(main(email)))
