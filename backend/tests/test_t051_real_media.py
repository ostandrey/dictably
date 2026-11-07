"""T-051: video keep-until-ASR, near-identical stereo, minutes failure status."""

from __future__ import annotations

import shutil
import struct
import subprocess
import wave
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from dictably.db.models import Media, ProductEvent
from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.ffmpeg_media import stereo_channels_near_identical
from dictably.domain.media import ProbeResult
from dictably.providers.storage.local import LocalStorageProvider

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


async def _login(client: AsyncClient, email: str = "t051@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "T051"},
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
    return ProbeResult(ok=True, duration_ms=2_000)


def _write_stereo_wav(path: Path, *, identical: bool, duration_s: float = 1.0) -> None:
    import math

    rate = 16_000
    n = int(rate * duration_s)
    frames = bytearray()
    half = n // 2
    for i in range(n):
        if identical:
            # Screen/phone: both channels carry the same mix.
            v = int(8000 * math.sin(2 * math.pi * 440 * i / rate))
            left = right = v
        elif i < half:
            # True dual: speaker A only on left, then B only on right.
            left = int(8000 * math.sin(2 * math.pi * 440 * i / rate))
            right = 0
        else:
            left = 0
            right = int(8000 * math.sin(2 * math.pi * 660 * i / rate))
        frames += struct.pack("<hh", left, right)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg required")
def test_stereo_near_identical_true_and_false(tmp_path: Path) -> None:
    same = tmp_path / "same.wav"
    split = tmp_path / "split.wav"
    _write_stereo_wav(same, identical=True)
    _write_stereo_wav(split, identical=False)
    assert stereo_channels_near_identical(same) is True
    assert stereo_channels_near_identical(split) is False


def _tiny_mp4(tmp_path: Path) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg
    mp4 = tmp_path / "clip.mp4"
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=160x120:d=1",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(mp4),
        ],
        check=True,
        capture_output=True,
    )
    return mp4


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg required")
@pytest.mark.asyncio
async def test_video_mp4_pipeline_to_ready(
    client: AsyncClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T-051 S4: real ffmpeg via _pipeline — catches early original delete.

    Keep ENV=test so upload still runs inline; force soft=False inside _pipeline
    so normalize_for_asr actually reads the original (soft stubs hide the bug).
    """
    monkeypatch.delenv("DICTABLY_E2E_SOFT_FFMPEG", raising=False)

    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)

    real_pipeline = process_domain._pipeline
    asr_sizes: list[int] = []

    async def hard_pipeline(session, storage, settings, **kwargs):  # noqa: ANN001
        class _Hard:
            def __getattr__(self, name: str):
                if name == "is_test":
                    return False
                return getattr(settings, name)

        return await real_pipeline(session, storage, _Hard(), **kwargs)

    real_normalize_for_asr = process_domain.normalize_for_asr

    def tracking_normalize_for_asr(src, dest_dir, **kwargs):  # noqa: ANN001
        result = real_normalize_for_asr(src, dest_dir, **kwargs)
        asr_sizes.append(result.path.stat().st_size if result.path.exists() else 0)
        return result

    monkeypatch.setattr(process_domain, "_pipeline", hard_pipeline)
    monkeypatch.setattr(process_domain, "normalize_for_asr", tracking_normalize_for_asr)

    mp4 = _tiny_mp4(tmp_path)
    csrf = await _login(client, "t051-video@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("clip.mp4", mp4.read_bytes(), "video/mp4")},
    )
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["status"] == "ready", body
    media_id = body["id"]
    assert asr_sizes and asr_sizes[0] > 0, "ASR prep must produce non-empty audio from original"

    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200, tr.text
    assert len(tr.json()["segments"]) >= 1

    # Original kept for retention (T-038); playback exists.
    from dictably.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        media = await session.get(Media, __import__("uuid").UUID(media_id))
        assert media is not None
        keys = dict(media.storage_keys or {})
        assert keys.get("original"), "original must survive ASR"
        assert keys.get("playback")
        orig_path = await store.get_path(str(keys["original"]))
        assert orig_path.exists() and orig_path.stat().st_size > 0


@pytest.mark.asyncio
async def test_minutes_failure_sets_status_and_event(
    client: AsyncClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)

    async def boom(*_a, **_k):  # noqa: ANN002
        raise RuntimeError("llm gateway model denied")

    monkeypatch.setattr(
        "dictably.domain.analysis.run_and_store",
        AsyncMock(side_effect=boom),
    )

    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("meet.wav", b"fake-audio-bytes", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["status"] == "ready", body
    assert body.get("minutes_status") == "failed"
    media_id = body["id"]

    # Transcript still available; analysis 404.
    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200, tr.text
    an = await client.get(f"/api/media/{media_id}/analysis")
    assert an.status_code == 404

    # Analytics event for Ops.
    from dictably.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        media = await session.get(Media, __import__("uuid").UUID(media_id))
        assert media is not None
        assert (media.asr_meta or {}).get("minutes_status") == "failed"
        ev = (
            (
                await session.execute(
                    select(ProductEvent).where(
                        ProductEvent.media_id == media.id,
                        ProductEvent.name == "processing_failed",
                    )
                )
            )
            .scalars()
            .first()
        )
        assert ev is not None
        assert (ev.props or {}).get("code") == "llm_failed"


@pytest.mark.asyncio
async def test_health_includes_llm_check(client: AsyncClient) -> None:
    res = await client.get("/api/health")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "llm" in data["checks"]
    assert data["checks"]["llm"]["ok"] is True
    assert data["checks"]["llm"]["provider"] == "fake"


@pytest.mark.asyncio
async def test_health_llm_down_is_200_degraded_no_detail(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T-051 S2: LLM failure must not 503 or leak provider detail."""
    from dictably.domain import health as health_domain

    async def boom(_settings):  # noqa: ANN001
        return {
            "ok": False,
            "provider": "assemblyai_gateway",
            "model": "claude-haiku-5-5",
            "error": "http_403",
            "detail": "Your account does not have access to this LLM Gateway model",
        }

    monkeypatch.setattr(health_domain, "check_llm", boom)
    monkeypatch.setenv("LLM_PROVIDER", "assemblyai_gateway")
    from dictably.core.config import get_settings

    get_settings.cache_clear()
    try:
        res = await client.get("/api/health")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["status"] == "degraded"
        assert data["checks"]["llm"]["ok"] is False
        assert "detail" not in data["checks"]["llm"]
    finally:
        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        get_settings.cache_clear()
