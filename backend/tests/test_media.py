from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from dictably.api.media import reject_huge_upload
from dictably.core.config import get_settings
from dictably.db.models import Analysis, Job, Media, MediaStatus, Speaker, Transcript, User
from dictably.db.session import reset_engine
from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain.media import HARD_REJECT_BYTES, ProbeResult
from dictably.providers.storage.local import LocalStorageProvider

# ProbeResult used by storage fixture soft-probe for post-upload processing.


async def _login(client: AsyncClient, email: str = "owner@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Owner"},
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


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    monkeypatch.setattr(
        "dictably.domain.process.probe_file",
        lambda _p, **_k: ProbeResult(ok=True, duration_ms=12_000),
    )
    return store


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


@pytest.mark.asyncio
async def test_upload_list_get(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client)

    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("standup.m4a", b"fake-audio-bytes", "audio/mp4")},
    )
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["filename"] == "standup.m4a"
    assert body["status"] == "ready"  # T-013/14 inline process in ENV=test
    assert body["size_bytes"] == len(b"fake-audio-bytes")
    assert body["duration_ms"] == 12_000
    media_id = body["id"]

    listed = await client.get("/api/media")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == media_id

    one = await client.get(f"/api/media/{media_id}")
    assert one.status_code == 200
    assert one.json()["filename"] == "standup.m4a"

    stored = list(storage.root.rglob("original.m4a"))
    assert len(stored) == 1
    assert stored[0].read_bytes() == b"fake-audio-bytes"


@pytest.mark.asyncio
async def test_foreign_media_is_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf_a = await _login(client, "a@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        files={"file": ("a.wav", b"aaaa", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]

    await client.post(
        "/api/auth/logout",
        headers={auth_domain.CSRF_HEADER: csrf_a},
    )
    await _login(client, "b@example.com")
    res = await client.get(f"/api/media/{media_id}")
    assert res.status_code == 404

    listed = await client.get("/api/media")
    assert listed.json()["items"] == []
    _ = storage


@pytest.mark.asyncio
async def test_upload_requires_auth_and_csrf(
    client: AsyncClient,
    storage: LocalStorageProvider,
) -> None:
    anon = await client.post(
        "/api/media",
        files={"file": ("x.wav", b"x", "audio/wav")},
    )
    assert anon.status_code == 401

    await _login(client)
    missing = await client.post(
        "/api/media",
        files={"file": ("x.wav", b"x", "audio/wav")},
    )
    assert missing.status_code == 403
    _ = storage


@pytest.mark.asyncio
async def test_rejects_bad_extension_and_empty(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client)

    bad = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("notes.exe", b"MZ", "application/octet-stream")},
    )
    assert bad.status_code == 422

    empty = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("empty.wav", b"", "audio/wav")},
    )
    assert empty.status_code == 422
    assert not any(p.is_file() for p in storage.root.rglob("*"))


@pytest.mark.asyncio
async def test_rejects_when_probe_fails(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        media_domain,
        "probe_file",
        lambda _p, **_k: ProbeResult(ok=False, error="not_media"),
    )
    csrf = await _login(client)
    res = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("bad.wav", b"not-really-wav", "audio/wav")},
    )
    assert res.status_code == 422
    assert not any(p.is_file() for p in storage.root.rglob("*"))


@pytest.mark.asyncio
async def test_stream_enforces_max_bytes(tmp_path: Path) -> None:
    store = LocalStorageProvider(tmp_path)

    async def chunks() -> AsyncIterator[bytes]:
        yield b"12345"
        yield b"67890"

    with pytest.raises(ValueError, match="too_large"):
        await store.put_stream("k.bin", chunks(), max_bytes=8)


def test_reject_huge_upload_header() -> None:
    req = MagicMock()
    req.headers = {"content-length": str(HARD_REJECT_BYTES + 1)}
    with pytest.raises(HTTPException) as excinfo:
        reject_huge_upload(req)
    assert excinfo.value.status_code == 413


def test_probe_missing_fail_closed_vs_soft(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(*_a: object, **_k: object) -> None:
        raise FileNotFoundError("ffprobe")

    monkeypatch.setattr(media_domain.subprocess, "run", _boom)
    path = tmp_path / "x.wav"
    path.write_bytes(b"x")

    hard = media_domain.probe_file(path, soft_missing=False)
    assert hard.ok is False
    assert hard.error == "ffprobe_missing"

    soft = media_domain.probe_file(path, soft_missing=True)
    assert soft.ok is True
    assert soft.error == "ffprobe_missing"


@pytest.mark.asyncio
async def test_upload_503_when_ffprobe_missing(
    client: AsyncClient,
    storage: LocalStorageProvider,
) -> None:
    await _login(client)
    settings = get_settings()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def chunks() -> AsyncIterator[bytes]:
        yield b"audio-bytes"

    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == "owner@example.com"))
        ).scalar_one()
        with pytest.raises(HTTPException) as excinfo:
            await media_domain.upload_recording(
                session,
                storage,
                user=user,
                filename="clip.wav",
                content_type="audio/wav",
                chunks=chunks(),
                soft_probe_missing=False,
                probe=lambda _p: ProbeResult(ok=False, error="ffprobe_missing"),
            )
        assert excinfo.value.status_code == 503

    await engine.dispose()
    await reset_engine()
    assert not any(p.is_file() for p in storage.root.rglob("*"))


@pytest.mark.asyncio
async def test_upload_soft_accepts_missing_ffprobe_in_test(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        media_domain,
        "probe_file",
        lambda _p, *, soft_missing=False: ProbeResult(
            ok=bool(soft_missing),
            duration_ms=None,
            error="ffprobe_missing",
        ),
    )
    csrf = await _login(client)
    res = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("clip.wav", b"audio", "audio/wav")},
    )
    assert res.status_code == 201, res.text


@pytest.mark.asyncio
async def test_delete_media_removes_files_and_rows(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T-018-lite AC: after delete, audio → 404 and related DB rows gone."""
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("gone.wav", b"delete-me-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]
    assert list(storage.root.rglob("*"))

    audio_before = await client.get(f"/api/media/{media_id}/audio")
    assert audio_before.status_code == 200

    deleted = await client.delete(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert deleted.status_code == 204, deleted.text

    assert (await client.get(f"/api/media/{media_id}")).status_code == 404
    assert (await client.get(f"/api/media/{media_id}/audio")).status_code == 404
    listed = await client.get("/api/media")
    assert listed.json()["items"] == []
    assert not any(p.is_file() for p in storage.root.rglob("*"))

    settings = get_settings()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    mid = UUID(media_id)
    async with factory() as session:
        assert (await session.get(Media, mid)) is None
        assert (
            await session.execute(select(Transcript).where(Transcript.media_id == mid))
        ).scalars().first() is None
        assert (
            await session.execute(select(Speaker).where(Speaker.media_id == mid))
        ).scalars().first() is None
        assert (
            await session.execute(select(Analysis).where(Analysis.media_id == mid))
        ).scalars().first() is None
        assert (
            await session.execute(select(Job).where(Job.media_id == mid))
        ).scalars().first() is None
    await engine.dispose()
    await reset_engine()


@pytest.mark.asyncio
async def test_delete_foreign_media_is_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf_a = await _login(client, "owner-del@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        files={"file": ("keep.wav", b"keep", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]

    await client.post(
        "/api/auth/logout",
        headers={auth_domain.CSRF_HEADER: csrf_a},
    )
    csrf_b = await _login(client, "intruder-del@example.com")
    res = await client.delete(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf_b},
    )
    assert res.status_code == 404
    assert any(p.is_file() for p in storage.root.rglob("*"))
    _ = storage


@pytest.mark.asyncio
async def test_delete_while_processing_is_409(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """S1: do not delete while worker may still write files."""
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client, "busy-del@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("busy.wav", b"busy-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]

    settings = get_settings()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        row = await session.get(Media, UUID(media_id))
        assert row is not None
        row.status = MediaStatus.processing
        await session.commit()
    await engine.dispose()
    await reset_engine()

    res = await client.delete(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 409
    assert "Wait until processing finishes" in res.json()["detail"]
    assert (await client.get(f"/api/media/{media_id}")).status_code == 200
    assert any(p.is_file() for p in storage.root.rglob("*"))
