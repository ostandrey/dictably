"""T-047 N1/N2: soft ffmpeg flag + soft stub on bad convert."""

from __future__ import annotations

from pathlib import Path

import pytest

from dictably.domain import ffmpeg_media


def test_e2e_soft_flag_forces_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DICTABLY_E2E_SOFT_FFMPEG", "1")
    with pytest.raises(ffmpeg_media.FfmpegError, match="soft-forced"):
        ffmpeg_media.require_ffmpeg()
    with pytest.raises(ffmpeg_media.FfmpegError, match="soft-forced"):
        ffmpeg_media.require_ffprobe()


def test_soft_stub_on_bad_convert_when_soft_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """N2: ENV=test soft path stubs bad bytes even if ffmpeg is installed."""
    monkeypatch.delenv("DICTABLY_E2E_SOFT_FFMPEG", raising=False)
    src = tmp_path / "bad.wav"
    src.write_bytes(b"not-a-real-wav")
    dest = tmp_path / "out"
    result = ffmpeg_media.normalize_to_playback(src, dest, soft_missing=True)
    assert result.playback_path.is_file()
    assert result.playback_path.read_bytes() == b""
    assert result.duration_ms is None


def test_bad_convert_raises_without_soft(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DICTABLY_E2E_SOFT_FFMPEG", raising=False)
    if not ffmpeg_media.shutil.which("ffmpeg"):
        pytest.skip("ffmpeg required")
    src = tmp_path / "bad.wav"
    src.write_bytes(b"not-a-real-wav")
    dest = tmp_path / "out"
    with pytest.raises(ffmpeg_media.FfmpegError):
        ffmpeg_media.normalize_to_playback(src, dest, soft_missing=False)
