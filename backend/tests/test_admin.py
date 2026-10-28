"""T-019 admin API: non-admin → 404; admin list/grant/retry/delete; indexes."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from dictably.core.config import get_settings
from dictably.db.models import AuditLog, Job, JobKind, JobStatus, Media, MediaStatus, User
from dictably.domain import auth as auth_domain


async def _login(client: AsyncClient, email: str) -> str:
    login = await client.post("/api/auth/dev-login", json={"email": email, "name": "U"})
    assert login.status_code == 200, login.text
    return login.cookies[auth_domain.CSRF_COOKIE]


class _Db:
    def __init__(self) -> None:
        settings = get_settings()
        self.engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
        self.factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def __aenter__(self) -> AsyncSession:
        self.session = self.factory()
        return await self.session.__aenter__()

    async def __aexit__(self, *args: object) -> None:
        await self.session.__aexit__(*args)
        await self.engine.dispose()


async def _promote(email: str) -> User:
    async with _Db() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        await session.refresh(user)
        return user


@pytest.mark.asyncio
async def test_admin_routes_404_for_non_admin(client: AsyncClient) -> None:
    csrf = await _login(client, "plain@example.com")
    for method, path in [
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/media"),
        ("GET", "/api/admin/jobs"),
        ("GET", "/api/admin/costs"),
    ]:
        res = await client.request(method, path)
        assert res.status_code == 404, path

    res = await client.post(
        "/api/admin/users/00000000-0000-0000-0000-000000000001/grant",
        json={"hours": 1},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_admin_users_grant_costs_audit(client: AsyncClient) -> None:
    await _login(client, "target@example.com")
    csrf = await _login(client, "admin@example.com")
    await _promote("admin@example.com")

    users = await client.get("/api/admin/users")
    assert users.status_code == 200, users.text
    items = users.json()["items"]
    target = next(u for u in items if u["email"] == "target@example.com")
    before = target["balance_seconds"]

    grant = await client.post(
        f"/api/admin/users/{target['id']}/grant",
        json={"hours": 2},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert grant.status_code == 200, grant.text
    assert grant.json()["balance_seconds"] == before + 7200

    async with _Db() as session:
        logs = await session.execute(select(AuditLog).where(AuditLog.action == "admin.user.grant"))
        assert logs.scalars().first() is not None

    costs = await client.get("/api/admin/costs?period=month")
    assert costs.status_code == 200
    body = costs.json()
    assert body["period"] == "month"
    assert "total_usd" in body


@pytest.mark.asyncio
async def test_admin_media_jobs_retry_delete(client: AsyncClient) -> None:
    csrf = await _login(client, "admin2@example.com")
    admin = await _promote("admin2@example.com")

    async with _Db() as session:
        media = Media(
            user_id=admin.id,
            filename="fail.m4a",
            status=MediaStatus.failed,
            error="boom",
            storage_keys={},
        )
        session.add(media)
        await session.flush()
        job = Job(
            media_id=media.id,
            kind=JobKind.process_media,
            status=JobStatus.failed,
            attempts=3,
            last_error="boom",
        )
        session.add(job)
        ready = Media(
            user_id=admin.id,
            filename="ok.m4a",
            status=MediaStatus.ready,
            storage_keys={},
        )
        session.add(ready)
        await session.flush()
        ok_job = Job(
            media_id=ready.id,
            kind=JobKind.process_media,
            status=JobStatus.succeeded,
            attempts=1,
        )
        session.add(ok_job)
        await session.commit()
        media_id, job_id, ready_id, ok_job_id = media.id, job.id, ready.id, ok_job.id

    media_list = await client.get("/api/admin/media?status=failed")
    assert media_list.status_code == 200
    assert any(m["id"] == str(media_id) for m in media_list.json()["items"])

    jobs = await client.get("/api/admin/jobs?status=failed")
    assert jobs.status_code == 200
    assert any(j["id"] == str(job_id) for j in jobs.json()["items"])

    conflict = await client.post(
        f"/api/admin/jobs/{ok_job_id}/retry",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert conflict.status_code == 409

    retry = await client.post(
        f"/api/admin/jobs/{job_id}/retry",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert retry.status_code == 200, retry.text
    assert retry.json()["kind"] == "process_media"

    deleted = await client.delete(
        f"/api/admin/media/{ready_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert deleted.status_code == 204

    async with _Db() as session:
        assert await session.get(Media, ready_id) is None
        audit = await session.execute(
            select(AuditLog).where(AuditLog.action == "admin.media.delete")
        )
        assert audit.scalars().first() is not None


@pytest.mark.asyncio
async def test_admin_indexes_exist(settings) -> None:  # noqa: ANN001 — fixture
    expected = {
        "ix_sessions_user_id",
        "ix_media_user_id_created_at",
        "ix_analyses_media_id_created_at",
        "ix_jobs_status_created_at",
    }
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
        )
        found = {r[0] for r in rows.all()}
        assert expected <= found

        plan_media = await conn.execute(
            text(
                "EXPLAIN SELECT id FROM media WHERE user_id = "
                "'00000000-0000-0000-0000-000000000001'::uuid "
                "ORDER BY created_at DESC LIMIT 20"
            )
        )
        assert "media" in "\n".join(r[0] for r in plan_media.all()).lower()

        plan_jobs = await conn.execute(
            text(
                "EXPLAIN SELECT id FROM jobs WHERE status = 'failed' "
                "ORDER BY created_at DESC LIMIT 20"
            )
        )
        assert "jobs" in "\n".join(r[0] for r in plan_jobs.all()).lower()
    await engine.dispose()
