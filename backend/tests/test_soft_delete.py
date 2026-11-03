"""T-040 B1 soft-delete / restore / purge + S1 retry race."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from dictably.core.config import get_settings
from dictably.db.models import Media, MediaStatus
from dictably.db.session import reset_engine
from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain.media import ProbeResult
from dictably.providers.storage.local import LocalStorageProvider


async def _login(client: AsyncClient, email: str = "soft@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Soft"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text
    return csrf


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    return store


@pytest.mark.asyncio
async def test_soft_delete_hides_then_restore(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("soft.wav", b"audio-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]
    prev_status = up.json()["status"]

    deleted = await client.delete(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert deleted.status_code == 204, deleted.text

    assert (await client.get(f"/api/media/{media_id}")).status_code == 404
    assert (await client.get(f"/api/media/{media_id}/audio")).status_code == 404
    listed = await client.get("/api/media")
    assert listed.json()["items"] == []

    # Row still in DB as deleted; files still on disk.
    settings = get_settings()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    mid = UUID(media_id)
    async with factory() as session:
        row = await session.get(Media, mid)
        assert row is not None
        assert row.status == MediaStatus.deleted
        assert row.deleted_at is not None
        assert row.status_before_delete == prev_status
    await engine.dispose()
    await reset_engine()
    assert any(p.is_file() for p in storage.root.rglob("*"))

    restored = await client.post(
        f"/api/media/{media_id}/restore",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["status"] == prev_status
    assert (await client.get(f"/api/media/{media_id}")).status_code == 200


@pytest.mark.asyncio
async def test_restore_after_window_409(
    client: AsyncClient,
    db_session: AsyncSession,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client, "expire@example.com")
    me = await client.get("/api/me")
    user_id = UUID(me.json()["id"])

    media = Media(
        user_id=user_id,
        filename="old.wav",
        status=MediaStatus.deleted,
        status_before_delete=MediaStatus.ready,
        deleted_at=datetime.now(UTC) - timedelta(seconds=60),
        storage_keys={},
        size_bytes=4,
    )
    db_session.add(media)
    await db_session.commit()
    mid = media.id

    res = await client.post(
        f"/api/media/{mid}/restore",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_purge_soft_deleted_removes_files(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client, "purge@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("purge.wav", b"purge-me", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]

    await client.delete(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
    )

    settings = get_settings()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    mid = UUID(media_id)
    async with factory() as session:
        row = await session.get(Media, mid)
        assert row is not None
        row.deleted_at = datetime.now(UTC) - timedelta(seconds=60)
        await session.commit()
        n = await media_domain.purge_soft_deleted(session, storage)
        assert n == 1
        assert (await session.get(Media, mid)) is None
    await engine.dispose()
    await reset_engine()
    assert not any(p.is_file() for p in storage.root.rglob("*"))


@pytest.mark.asyncio
async def test_restore_foreign_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf_a = await _login(client, "owner-soft@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        files={"file": ("mine.wav", b"x", "audio/wav")},
    )
    media_id = up.json()["id"]
    await client.delete(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf_a},
    )

    csrf_b = await _login(client, "other-soft@example.com")
    res = await client.post(
        f"/api/media/{media_id}/restore",
        headers={auth_domain.CSRF_HEADER: csrf_b},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_retry_double_click_409(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from dictably.domain import process as process_domain

    csrf = await _login(client, "retry2@example.com")
    me = await client.get("/api/me")
    user_id = UUID(me.json()["id"])
    store = LocalStorageProvider(tmp_path / "storage")
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)

    media = Media(
        user_id=user_id,
        filename="fail.wav",
        status=MediaStatus.failed,
        error="boom",
        storage_keys={},
        size_bytes=4,
    )
    db_session.add(media)
    await db_session.flush()
    key = f"u/{user_id}/{media.id}/original.wav"
    await store.put_bytes(key, b"abcd")
    media.storage_keys = {"original": key}
    await db_session.commit()
    mid = media.id

    calls = {"n": 0}

    async def _once(session, *, media_id, settings=None):  # noqa: ANN001
        calls["n"] += 1
        row = await session.get(Media, media_id)
        assert row is not None
        row.status = MediaStatus.queued
        await session.commit()
        return row

    monkeypatch.setattr(process_domain, "enqueue_or_run_process", _once)

    first = await client.post(
        f"/api/media/{mid}/retry",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert first.status_code == 200, first.text
    second = await client.post(
        f"/api/media/{mid}/retry",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert second.status_code == 409, second.text
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_retry_parallel_one_200_one_409(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """T-045 S6: two concurrent retries → one 200, one 409, one enqueue."""
    import asyncio

    from dictably.domain import process as process_domain

    csrf = await _login(client, "retry-par@example.com")
    me = await client.get("/api/me")
    user_id = UUID(me.json()["id"])
    store = LocalStorageProvider(tmp_path / "storage-par")
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)

    media = Media(
        user_id=user_id,
        filename="fail-par.wav",
        status=MediaStatus.failed,
        error="boom",
        storage_keys={},
        size_bytes=4,
    )
    db_session.add(media)
    await db_session.flush()
    key = f"u/{user_id}/{media.id}/original.wav"
    await store.put_bytes(key, b"abcd")
    media.storage_keys = {"original": key}
    await db_session.commit()
    mid = media.id

    calls = {"n": 0}

    async def _hold(session, *, media_id, settings=None):  # noqa: ANN001
        calls["n"] += 1
        await asyncio.sleep(0.05)
        row = await session.get(Media, media_id)
        assert row is not None
        row.status = MediaStatus.queued
        await session.commit()
        return row

    monkeypatch.setattr(process_domain, "enqueue_or_run_process", _hold)

    async def _retry() -> int:
        res = await client.post(
            f"/api/media/{mid}/retry",
            headers={auth_domain.CSRF_HEADER: csrf},
        )
        return res.status_code

    codes = sorted(await asyncio.gather(_retry(), _retry()))
    assert codes == [200, 409], codes
    assert calls["n"] == 1
