"""T-038 B1/B6: fair queue with dispatched status (arq-mode via mocked _dispatch_job)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from dictably.core.config import get_settings
from dictably.db.models import Job, JobKind, JobStatus, Media, MediaStatus, User
from dictably.db.session import get_session_factory
from dictably.domain import auth as auth_domain
from dictably.domain import process as process_domain


async def _login(client: AsyncClient, email: str) -> None:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Fair"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text


@pytest.mark.asyncio
async def test_fair_queue_arq_mode_dispatch_counts(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A×10 → 1 dispatched + 9 queued; B×1 → dispatched; A finish → next one."""
    await _login(client, "fair-a2@example.com")
    settings = get_settings().model_copy(
        update={
            "fair_queue_limit_free": 1,
            "fair_queue_treat_all_elevated": False,
            # Force non-inline path so we use _dispatch_job (mocked).
            "inline_media_process": False,
            "env": "dev",
        }
    )

    dispatched: list[tuple[UUID, UUID]] = []

    async def fake_dispatch(*, media_id: UUID, job_id: UUID, settings) -> None:  # noqa: ANN001
        dispatched.append((media_id, job_id))

    monkeypatch.setattr(process_domain, "_dispatch_job", fake_dispatch)

    factory = get_session_factory()
    async with factory() as session:
        user_a = (
            await session.execute(select(User).where(User.email == "fair-a2@example.com"))
        ).scalar_one()

        jobs_a: list[Job] = []
        for i in range(10):
            m = Media(
                user_id=user_a.id,
                filename=f"a-{i}.m4a",
                status=MediaStatus.uploaded,
                storage_keys={},
            )
            session.add(m)
            await session.flush()
            job = await process_domain.enqueue_or_run_process(
                session, media_id=m.id, settings=settings
            )
            jobs_a.append(job)

        statuses = [j.status for j in jobs_a]
        assert statuses.count(JobStatus.dispatched) == 1
        assert statuses.count(JobStatus.queued) == 9
        assert len(dispatched) == 1

        for j in jobs_a:
            await session.refresh(j)
        assert sum(1 for j in jobs_a if j.status == JobStatus.dispatched) == 1
        assert sum(1 for j in jobs_a if j.status == JobStatus.queued) == 9

    await _login(client, "fair-b2@example.com")
    async with factory() as session:
        user_b = (
            await session.execute(select(User).where(User.email == "fair-b2@example.com"))
        ).scalar_one()
        m_b = Media(
            user_id=user_b.id,
            filename="b.m4a",
            status=MediaStatus.uploaded,
            storage_keys={},
        )
        session.add(m_b)
        await session.flush()
        job_b = await process_domain.enqueue_or_run_process(
            session, media_id=m_b.id, settings=settings
        )
        assert job_b.status == JobStatus.dispatched
        assert len(dispatched) == 2

    # Finish A's first dispatched job → exactly one more dispatched.
    async with factory() as session:
        user_a = (
            await session.execute(select(User).where(User.email == "fair-a2@example.com"))
        ).scalar_one()
        first = (
            await session.execute(
                select(Job)
                .join(Media, Media.id == Job.media_id)
                .where(
                    Media.user_id == user_a.id,
                    Job.status == JobStatus.dispatched,
                )
                .order_by(Job.created_at.asc())
                .limit(1)
            )
        ).scalar_one()
        first.status = JobStatus.succeeded
        med = await session.get(Media, first.media_id)
        assert med is not None
        med.status = MediaStatus.ready
        await session.commit()
        before = len(dispatched)
        nxt = await process_domain.maybe_start_next_for_user(
            session, user_id=user_a.id, settings=settings
        )
        assert nxt is not None
        assert nxt.status == JobStatus.dispatched
        assert len(dispatched) == before + 1

        q = (
            (
                await session.execute(
                    select(Job)
                    .join(Media, Media.id == Job.media_id)
                    .where(
                        Media.user_id == user_a.id,
                        Job.status == JobStatus.queued,
                    )
                )
            )
            .scalars()
            .all()
        )
        d = (
            (
                await session.execute(
                    select(Job)
                    .join(Media, Media.id == Job.media_id)
                    .where(
                        Media.user_id == user_a.id,
                        Job.status == JobStatus.dispatched,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(d) == 1
        assert len(q) == 8


@pytest.mark.asyncio
async def test_fair_queue_long_wait_not_killed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """B6: created_at old + freshly dispatched stays; dispatched_at old → fail + next."""
    await _login(client, "fair-stale@example.com")
    settings = get_settings().model_copy(
        update={
            "fair_queue_limit_free": 1,
            "fair_queue_treat_all_elevated": False,
            "inline_media_process": False,
            "env": "dev",
        }
    )

    async def fake_dispatch(*, media_id: UUID, job_id: UUID, settings) -> None:  # noqa: ANN001
        return None

    monkeypatch.setattr(process_domain, "_dispatch_job", fake_dispatch)

    factory = get_session_factory()
    now = datetime.now(UTC)
    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == "fair-stale@example.com"))
        ).scalar_one()

        m_fresh = Media(
            user_id=user.id,
            filename="long-wait.m4a",
            status=MediaStatus.uploaded,
            storage_keys={},
        )
        m_next = Media(
            user_id=user.id,
            filename="next.m4a",
            status=MediaStatus.queued,
            storage_keys={},
        )
        session.add_all([m_fresh, m_next])
        await session.flush()

        fresh = Job(
            media_id=m_fresh.id,
            kind=JobKind.process_media,
            status=JobStatus.dispatched,
            attempts=0,
            created_at=now - timedelta(hours=2),
            dispatched_at=now,
        )
        waiting = Job(
            media_id=m_next.id,
            kind=JobKind.process_media,
            status=JobStatus.queued,
            attempts=0,
            created_at=now - timedelta(hours=2),
        )
        session.add_all([fresh, waiting])
        await session.commit()
        fresh_id = fresh.id
        waiting_id = waiting.id

        result = await process_domain.fair_queue_maintenance(session, settings=settings)
        await session.refresh(fresh)
        await session.refresh(waiting)
        assert fresh.status == JobStatus.dispatched
        assert waiting.status == JobStatus.queued
        assert result["failed_stale"] == 0

    async with factory() as session:
        # Dispatched 2h ago and never taken → fail + start next.
        old = await session.get(Job, fresh_id)
        assert old is not None
        old.dispatched_at = now - timedelta(hours=2)
        await session.commit()

        result = await process_domain.fair_queue_maintenance(session, settings=settings)
        old = await session.get(Job, fresh_id)
        nxt = await session.get(Job, waiting_id)
        assert old is not None and old.status == JobStatus.failed
        assert nxt is not None and nxt.status == JobStatus.dispatched
        assert nxt.dispatched_at is not None
        assert result["failed_stale"] >= 1
