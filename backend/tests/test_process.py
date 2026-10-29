from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from dictably.core.config import get_settings
from dictably.db.models import CreditKind, CreditLedger, Job, JobKind, MediaStatus
from dictably.domain import auth as auth_domain
from dictably.domain import ledger as ledger_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.ffmpeg_media import FfmpegError
from dictably.domain.media import ProbeResult, format_name_allowed, probe_file
from dictably.providers.asr.assemblyai import (
    AssemblyAIError,
    AssemblyAIProvider,
    normalize_assemblyai,
)
from dictably.providers.asr.fake import FakeASRProvider
from dictably.providers.storage.local import LocalStorageProvider


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
    return store


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


@pytest.mark.asyncio
async def test_upload_processes_to_ready(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)
    csrf = await _login(client)

    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("meet.wav", b"fake-audio-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["status"] == "ready", body
    media_id = body["id"]

    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200, tr.text
    assert len(tr.json()["segments"]) >= 1
    assert tr.json()["provider"] == "fake"


@pytest.mark.asyncio
async def test_transcript_foreign_media_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """S4: another user cannot read /media/{id}/transcript."""
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)
    csrf_a = await _login(client, "owner-a@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        files={"file": ("meet.wav", b"fake-audio-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]

    await client.post("/api/auth/logout", headers={auth_domain.CSRF_HEADER: csrf_a})
    csrf_b = await _login(client, "owner-b@example.com")
    tr = await client.get(
        f"/api/media/{media_id}/transcript",
        headers={auth_domain.CSRF_HEADER: csrf_b},
    )
    assert tr.status_code == 404


@pytest.mark.asyncio
async def test_invalid_media_fails_human_message(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """S4 / T-013 AC: renamed .exe→.mp3 → failed with human error; one attempt (S1)."""
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)

    def bad_probe(_path: Path, **_kwargs: object) -> ProbeResult:
        return ProbeResult(ok=False, error="not_media")

    monkeypatch.setattr(process_domain, "probe_file", bad_probe)
    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("app.exe.mp3", b"MZ-not-audio", "audio/mpeg")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]
    assert up.json()["status"] == "failed"
    got = await client.get(f"/api/media/{media_id}")
    assert got.status_code == 200
    assert got.json()["status"] == "failed"
    assert "not a valid" in (got.json()["error"] or "").lower()

    from dictably.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        job = (
            await session.execute(
                select(Job).where(Job.media_id == media_id, Job.kind == JobKind.process_media)
            )
        ).scalar_one()
        assert job.attempts == 1


@pytest.mark.asyncio
async def test_m3u8_as_mp3_fails_without_ffmpeg(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B1: HLS playlist renamed .mp3 → failed; normalize/ffmpeg never called."""
    playlist = (
        b"#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:1.0,\nhttp://evil.example/seg.ts\n#EXT-X-ENDLIST\n"
    )
    called: list[str] = []

    def capture_normalize(*_a: object, **_k: object) -> None:
        called.append("normalize")
        raise AssertionError("ffmpeg/normalize must not run for playlist")

    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(
        process_domain,
        "probe_file",
        lambda _p, **_k: ProbeResult(ok=False, error="not_media", format_name="hls"),
    )
    monkeypatch.setattr(process_domain, "normalize_to_playback", capture_normalize)

    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("stream.mp3", playlist, "audio/mpeg")},
    )
    assert up.status_code == 201, up.text
    assert up.json()["status"] == "failed"
    assert called == []
    assert "not a valid" in (up.json()["error"] or "").lower()


def test_format_name_whitelist() -> None:
    assert format_name_allowed("mp3")
    assert format_name_allowed("mov,mp4,m4a,3gp,3g2,mj2")
    assert format_name_allowed("mp4")
    assert not format_name_allowed("hls")
    assert not format_name_allowed("concat")
    assert not format_name_allowed(None)


def test_probe_rejects_hls_payload(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """B1: disallowed format_name → not_media; ffprobe cmd uses protocol_whitelist."""
    path = tmp_path / "x.mp3"
    path.write_bytes(b"#EXTM3U\n")
    captured: list[list[str]] = []

    class FakeCompleted:
        returncode = 0
        stdout = json.dumps(
            {
                "format": {"format_name": "hls", "duration": "1.0"},
                "streams": [{"codec_type": "audio", "duration": "1.0"}],
            }
        )

    def fake_run(cmd: list[str], **_kwargs: object) -> FakeCompleted:
        captured.append(list(cmd))
        return FakeCompleted()

    monkeypatch.setattr(media_domain.subprocess, "run", fake_run)
    result = probe_file(path)
    assert result.ok is False
    assert result.error == "not_media"
    assert "-protocol_whitelist" in captured[0]
    assert "file" in captured[0]


@pytest.mark.asyncio
async def test_asr_fallback_records_fallback_from(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """S4: primary ASR fails → fallback used; fallback_from recorded on transcript.model."""
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)

    class BoomASR:
        name = "boom"

        async def transcribe(self, **_kwargs: object) -> dict:
            raise RuntimeError("provider down")

    monkeypatch.setattr(process_domain, "get_asr_provider", lambda _s=None: BoomASR())
    monkeypatch.setattr(
        process_domain,
        "get_asr_fallback",
        lambda _s=None, exclude="": FakeASRProvider(),
    )

    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("meet.wav", b"fake-audio-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    assert up.json()["status"] == "ready"
    media_id = up.json()["id"]
    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200
    assert tr.json()["provider"] == "fake"
    assert "fallback_from=boom" in (tr.json().get("model") or "")


@pytest.mark.asyncio
async def test_assemblyai_deletes_on_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """B2: status=error still DELETE transcript."""
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"audio")
    deletes: list[str] = []

    class FakeResponse:
        def __init__(self, payload: dict, status_code: int = 200) -> None:
            self._payload = payload
            self.status_code = status_code

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("err", request=MagicMock(), response=MagicMock())

        def json(self) -> dict:
            return self._payload

    class FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, url: str, **kwargs: object) -> FakeResponse:
            if "upload" in url:
                return FakeResponse({"upload_url": "https://cdn.example/a"})
            return FakeResponse({"id": "tr_123"})

        async def get(self, url: str, **kwargs: object) -> FakeResponse:
            return FakeResponse({"status": "error", "error": "bad audio"})

        async def delete(self, url: str, **kwargs: object) -> FakeResponse:
            deletes.append(url)
            return FakeResponse({})

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    provider = AssemblyAIProvider("test-key", poll_timeout_s=10)
    with pytest.raises(AssemblyAIError, match="bad audio"):
        await provider.transcribe(audio_path=str(audio))
    assert any("tr_123" in u for u in deletes)


@pytest.mark.asyncio
async def test_quota_reserve_and_release_on_failure(
    db_session: AsyncSession,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dictably.db.models import Media, User

    user = User(email="quota@example.com", locale="en", role="user")
    db_session.add(user)
    await db_session.flush()
    trial = get_settings().trial_seconds
    await ledger_domain.ensure_trial_grant(db_session, user_id=user.id, seconds=trial)
    await db_session.commit()

    media = Media(
        user_id=user.id,
        filename="x.wav",
        status=MediaStatus.uploaded,
        storage_keys={},
        duration_ms=60_000,
    )
    db_session.add(media)
    await db_session.flush()
    key = f"u/{user.id}/{media.id}/original.wav"
    await storage.put_bytes(key, b"abcd")
    media.storage_keys = {"original": key}
    await db_session.commit()
    media_id = media.id

    monkeypatch.setattr(
        process_domain,
        "probe_file",
        lambda _p, **_k: ProbeResult(ok=True, duration_ms=60_000),
    )

    def boom(*_a: object, **_k: object) -> None:
        raise FfmpegError("ffmpeg failed")

    monkeypatch.setattr(process_domain, "normalize_to_playback", boom)

    await process_domain.run_process_media(media_id=media_id)

    from dictably.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        m = await session.get(Media, media_id)
        assert m is not None
        assert m.status == MediaStatus.failed
        rows = (
            (await session.execute(select(CreditLedger).where(CreditLedger.user_id == user.id)))
            .scalars()
            .all()
        )
        kinds = {r.kind for r in rows}
        assert CreditKind.reserve in kinds
        assert CreditKind.release in kinds
        bal = await ledger_domain.balance_seconds(session, user.id)
        assert bal == trial
        job = (
            await session.execute(
                select(Job).where(Job.media_id == media_id, Job.kind == JobKind.process_media)
            )
        ).scalar_one()
        assert job.attempts == 1  # permanent ffmpeg error — no retry (S1)


@pytest.mark.asyncio
async def test_concurrent_reserve_does_not_go_negative(
    db_session: AsyncSession,
    settings,
) -> None:
    """S3: two parallel reserves cannot overdraw."""
    import asyncio

    from dictably.db.models import User

    user = User(email="race@example.com", locale="en", role="user")
    db_session.add(user)
    await db_session.flush()
    await ledger_domain.grant(db_session, user_id=user.id, seconds=100, ref="seed")
    await db_session.commit()
    user_id = user.id

    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def try_reserve(ref: str) -> str:
        async with factory() as session:
            try:
                await ledger_domain.reserve(session, user_id=user_id, seconds=80, ref=ref)
                await session.commit()
                return "ok"
            except ledger_domain.InsufficientCredits:
                await session.rollback()
                return "short"

    results = await asyncio.gather(try_reserve("r1"), try_reserve("r2"))
    assert sorted(results) == ["ok", "short"]
    async with factory() as session:
        bal = await ledger_domain.balance_seconds(session, user_id)
        assert bal == 20
    await engine.dispose()


def test_normalize_assemblyai_fixture() -> None:
    raw = {
        "status": "completed",
        "language_code": "en",
        "audio_duration": 12.5,
        "utterances": [
            {"speaker": "A", "start": 0, "end": 2000, "text": "Hello"},
            {"speaker": "B", "start": 2100, "end": 4000, "text": "Hi"},
        ],
        "words": [{"text": "Hello", "start": 0, "end": 500, "speaker": "A"}],
    }
    out = normalize_assemblyai(raw)
    assert out["provider"] == "assemblyai"
    assert len(out["segments"]) == 2
    assert out["segments"][0]["id"] == "S1"
    assert out["speakers"][0]["label"] == "A"
