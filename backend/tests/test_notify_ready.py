"""T-040 ready-email + upload-intent quota gate."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import get_settings
from dictably.db.models import Media, MediaStatus, User
from dictably.domain import auth as auth_domain
from dictably.domain import ledger as ledger_domain
from dictably.domain.notify import READY_EMAIL_SINK, clear_ready_email_sink, maybe_send_ready_email
from dictably.providers.storage.local import LocalStorageProvider


async def _login(client: AsyncClient, email: str = "ready@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Ready"},
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


@pytest.mark.asyncio
async def test_ready_email_sink_after_long_processing(db_session: AsyncSession) -> None:
    clear_ready_email_sink()
    user = User(email="long@example.com", locale="en", role="user", notify_ready_email=True)
    db_session.add(user)
    await db_session.flush()
    media = Media(
        user_id=user.id,
        filename="long.wav",
        status=MediaStatus.ready,
        title="Weekly sync",
        size_bytes=100,
        storage_keys={},
    )
    db_session.add(media)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(media)

    settings = get_settings()
    sent = await maybe_send_ready_email(
        settings=settings,
        user=user,
        media=media,
        processing_seconds=301,
    )
    assert sent is True
    # Sink only fills when ENV=test (S3); still assert send path returned True.
    if get_settings().is_test:
        assert len(READY_EMAIL_SINK) == 1
        assert "Weekly sync" in READY_EMAIL_SINK[0]["subject"]
        assert str(media.id) in READY_EMAIL_SINK[0]["body"]
        assert "\n" not in READY_EMAIL_SINK[0]["subject"]

    clear_ready_email_sink()
    skipped = await maybe_send_ready_email(
        settings=settings,
        user=user,
        media=media,
        processing_seconds=60,
    )
    assert skipped is False
    assert READY_EMAIL_SINK == []


@pytest.mark.asyncio
async def test_ready_email_uk_locale(db_session: AsyncSession) -> None:
    clear_ready_email_sink()
    user = User(
        email="uk@example.com",
        locale="uk",
        role="user",
        notify_ready_email=True,
    )
    db_session.add(user)
    await db_session.flush()
    media = Media(
        user_id=user.id,
        filename="x.wav",
        status=MediaStatus.ready,
        title="Нарада\nтижнева",
        size_bytes=10,
        storage_keys={},
    )
    db_session.add(media)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(media)

    sent = await maybe_send_ready_email(
        settings=get_settings(),
        user=user,
        media=media,
        processing_seconds=400,
    )
    assert sent is True
    if get_settings().is_test:
        assert READY_EMAIL_SINK[0]["subject"].startswith("Готово")
        assert "\n" not in READY_EMAIL_SINK[0]["subject"]


@pytest.mark.asyncio
async def test_ready_email_respects_opt_out(db_session: AsyncSession) -> None:
    clear_ready_email_sink()
    user = User(
        email="quiet@example.com",
        locale="en",
        role="user",
        notify_ready_email=False,
    )
    db_session.add(user)
    await db_session.flush()
    media = Media(
        user_id=user.id,
        filename="x.wav",
        status=MediaStatus.ready,
        size_bytes=10,
        storage_keys={},
    )
    db_session.add(media)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(media)

    sent = await maybe_send_ready_email(
        settings=get_settings(),
        user=user,
        media=media,
        processing_seconds=400,
    )
    assert sent is False
    assert READY_EMAIL_SINK == []


@pytest.mark.asyncio
async def test_patch_notify_ready_email(client: AsyncClient) -> None:
    csrf = await _login(client)
    me = await client.get("/api/me")
    assert me.status_code == 200
    assert me.json().get("notify_ready_email") is True
    assert int(me.json()["balance_seconds"]) > 0

    patched = await client.patch(
        "/api/me",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"notify_ready_email": False},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["notify_ready_email"] is False


@pytest.mark.asyncio
async def test_upload_intent_quota_gate(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Declared duration longer than balance → 402 before bytes leave."""
    csrf = await _login(client, email="quota-gate@example.com")
    me = await client.get("/api/me")
    assert me.status_code == 200
    user_id = UUID(me.json()["id"])
    bal = int(me.json()["balance_seconds"])
    # Leave only 30s so a 2-minute declaration fails the gate.
    if bal > 30:
        await ledger_domain.reserve(
            db_session,
            user_id=user_id,
            seconds=bal - 30,
            ref="test:t040-drain",
        )
        await db_session.commit()

    store = LocalStorageProvider(tmp_path / "storage")
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)

    too_long = await client.post(
        "/api/media/upload-intent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={
            "filename": "long.wav",
            "content_type": "audio/wav",
            "size_bytes": 1024,
            "duration_ms": 120_000,
        },
    )
    assert too_long.status_code == 402, too_long.text

    under = await client.post(
        "/api/media/upload-intent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={
            "filename": "short.wav",
            "content_type": "audio/wav",
            "size_bytes": 1024,
            "duration_ms": 10_000,
        },
    )
    assert under.status_code != 402, under.text


@pytest.mark.asyncio
async def test_retry_failed_media(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from dictably.domain import process as process_domain

    csrf = await _login(client, email="retry@example.com")
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

    async def _queue_only(session, *, media_id, settings=None):  # noqa: ANN001
        row = await session.get(Media, media_id)
        assert row is not None
        row.status = MediaStatus.queued
        row.error = None
        await session.commit()
        return row

    monkeypatch.setattr(process_domain, "enqueue_or_run_process", _queue_only)

    res = await client.post(
        f"/api/media/{mid}/retry",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "queued"
    assert res.json().get("error") in (None, "")
