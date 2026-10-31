"""Seed Ops dashboard numbers for e2e screenshots (T-038 S6).

Usage: uv run python scripts/seed_ops.py <email>
Creates: 3 queued jobs, 1 running, several failed + succeeded (24h).
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from dictably.core.config import get_settings
from dictably.db.models import Job, JobKind, JobStatus, Media, MediaStatus, User
from dictably.db.session import get_session_factory, reset_engine


async def main(email: str) -> int:
    get_settings.cache_clear()
    await reset_engine()
    factory = get_session_factory()
    now = datetime.now(UTC)
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            print(f"user not found: {email}", file=sys.stderr)
            return 1

        rows: list[Media] = []
        for i in range(3):
            rows.append(
                Media(
                    user_id=user.id,
                    filename=f"ops-q-{i}.m4a",
                    status=MediaStatus.queued,
                    storage_keys={},
                )
            )
        running_m = Media(
            user_id=user.id,
            filename="ops-running.m4a",
            status=MediaStatus.processing,
            storage_keys={},
        )
        rows.append(running_m)
        for i in range(2):
            rows.append(
                Media(
                    user_id=user.id,
                    filename=f"ops-fail-{i}.m4a",
                    status=MediaStatus.failed,
                    storage_keys={},
                    error="seed",
                )
            )
        for i in range(4):
            rows.append(
                Media(
                    user_id=user.id,
                    filename=f"ops-ok-{i}.m4a",
                    status=MediaStatus.ready,
                    storage_keys={},
                )
            )
        session.add_all(rows)
        await session.flush()

        jobs: list[Job] = []
        for m in rows[:3]:
            jobs.append(
                Job(
                    media_id=m.id,
                    kind=JobKind.process_media,
                    status=JobStatus.queued,
                    attempts=0,
                    created_at=now - timedelta(minutes=10 + len(jobs)),
                )
            )
        jobs.append(
            Job(
                media_id=running_m.id,
                kind=JobKind.process_media,
                status=JobStatus.running,
                attempts=1,
                created_at=now - timedelta(minutes=5),
                dispatched_at=now - timedelta(minutes=5),
                heartbeat_at=now - timedelta(minutes=1),
            )
        )
        for m in rows[4:6]:
            jobs.append(
                Job(
                    media_id=m.id,
                    kind=JobKind.process_media,
                    status=JobStatus.failed,
                    attempts=3,
                    last_error="seed",
                    created_at=now - timedelta(hours=2),
                )
            )
        for m in rows[6:]:
            jobs.append(
                Job(
                    media_id=m.id,
                    kind=JobKind.process_media,
                    status=JobStatus.succeeded,
                    attempts=1,
                    timings={"elapsed_s": 42.0},
                    created_at=now - timedelta(hours=1),
                )
            )
        session.add_all(jobs)
        await session.commit()
        print(
            f"seeded ops for {email}: queued=3 running=1 failed=2 succeeded=4",
        )
    return 0


if __name__ == "__main__":
    email = (sys.argv[1] if len(sys.argv) > 1 else "") or os.environ.get("SEED_OPS_EMAIL", "")
    if not email:
        print("usage: seed_ops.py <email>", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(asyncio.run(main(email)))
