"""Seed N ready media rows for T-039 e2e (pagination)."""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from dictably.db.models import Media, MediaStatus, User
from dictably.db.session import get_session_factory, reset_engine


async def main() -> int:
    email = os.environ.get("SEED_MEDIA_EMAIL") or (sys.argv[1] if len(sys.argv) > 1 else "")
    count = int(os.environ.get("SEED_MEDIA_COUNT") or (sys.argv[2] if len(sys.argv) > 2 else "45"))
    prefix = os.environ.get("SEED_MEDIA_PREFIX") or "page-seed"
    if not email:
        print("email required", file=sys.stderr)
        return 1
    await reset_engine()
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            print(f"user not found: {email}", file=sys.stderr)
            return 1
        # Newest first in list: created_at descending from now.
        now = datetime.now(UTC)
        for i in range(count):
            row = Media(
                id=uuid4(),
                user_id=user.id,
                filename=f"{prefix}-{i:03d}.m4a",
                mime="audio/mp4",
                size_bytes=1000,
                duration_ms=60_000,
                status=MediaStatus.ready,
                storage_keys={},
            )
            # Second gaps so JSON/ISO timestamps stay distinct for SWR merge (B3).
            row.created_at = now - timedelta(seconds=i)
            session.add(row)
        await session.commit()
    print(f"seeded {count} media for {email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
