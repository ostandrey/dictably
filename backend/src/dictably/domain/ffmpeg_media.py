"""ffmpeg → playback.m4a + peaks.json (T-013)."""

from __future__ import annotations

import json
import logging
import math
import shutil
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

FFMPEG_TIMEOUT_S = 600
# Low rate for peak envelope only — 3h ≈ 1.4 MB PCM (T-013/14 S2).
PEAK_SAMPLE_RATE = 200


class FfmpegError(RuntimeError):
    pass


@dataclass(frozen=True)
class NormalizeResult:
    playback_path: Path
    peaks_path: Path
    duration_ms: int | None


def require_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise FfmpegError("ffmpeg not found")
    return exe


def normalize_to_playback(
    src: Path,
    dest_dir: Path,
    *,
    soft_missing: bool = False,
) -> NormalizeResult:
    """AAC mono 64 kbps + simple peak envelope. Soft mode for ENV=test without ffmpeg."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    playback = dest_dir / "playback.m4a"
    peaks = dest_dir / "peaks.json"

    try:
        ffmpeg = require_ffmpeg()
    except FfmpegError:
        if soft_missing:
            logger.warning("ffmpeg missing; soft-writing empty playback stub")
            playback.write_bytes(b"")
            peaks.write_text(json.dumps({"peaks": [], "duration_ms": None}), encoding="utf-8")
            return NormalizeResult(playback, peaks, None)
        raise

    cmd = [
        ffmpeg,
        "-protocol_whitelist",
        "file",
        "-y",
        "-i",
        str(src),
        "-vn",
        "-ac",
        "1",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        str(playback),
    ]
    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        raise FfmpegError("ffmpeg timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise FfmpegError(exc.stderr or "ffmpeg failed") from exc

    duration_ms, peak_vals = _peaks_via_pcm(ffmpeg, playback)
    peaks.write_text(
        json.dumps({"peaks": peak_vals, "duration_ms": duration_ms}),
        encoding="utf-8",
    )
    return NormalizeResult(playback, peaks, duration_ms)


def _peaks_via_pcm(ffmpeg: str, media: Path, buckets: int = 200) -> tuple[int | None, list[float]]:
    """Decode at PEAK_SAMPLE_RATE to stdout; stream-read s16le (S2)."""
    cmd = [
        ffmpeg,
        "-protocol_whitelist",
        "file",
        "-i",
        str(media),
        "-ac",
        "1",
        "-ar",
        str(PEAK_SAMPLE_RATE),
        "-f",
        "s16le",
        "pipe:1",
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except OSError:
        return None, []

    assert proc.stdout is not None
    chunks: list[bytes] = []
    try:
        while True:
            block = proc.stdout.read(65_536)
            if not block:
                break
            chunks.append(block)
        stderr = proc.stderr.read() if proc.stderr else b""
        rc = proc.wait(timeout=FFMPEG_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return None, []
    if rc != 0:
        logger.debug("peaks ffmpeg failed: %s", stderr[:500] if stderr else b"")
        return None, []

    data = b"".join(chunks)
    if not data:
        return None, []
    n = len(data) // 2
    duration_ms = int(n / PEAK_SAMPLE_RATE * 1000)
    if n < buckets:
        samples = list(struct.unpack(f"<{n}h", data[: n * 2]))
        peaks = [min(1.0, abs(s) / 32768) for s in samples]
        return duration_ms, peaks

    bucket = n // buckets
    peaks: list[float] = []
    for i in range(buckets):
        start = i * bucket
        chunk = data[start * 2 : (start + bucket) * 2]
        if len(chunk) < 2:
            peaks.append(0.0)
            continue
        count = len(chunk) // 2
        vals = struct.unpack(f"<{count}h", chunk[: count * 2])
        rms = math.sqrt(sum(v * v for v in vals) / count) / 32768
        peaks.append(min(1.0, rms * 2))
    return duration_ms, peaks
