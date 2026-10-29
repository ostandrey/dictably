"""ffmpeg → playback.m4a + peaks.json + ASR prep WAV (T-013 / T-035)."""

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
ASR_SAMPLE_RATE = 16_000
# Energy floor (RMS of s16) to treat a channel as "live".
CHANNEL_LIVE_RMS = 200.0


class FfmpegError(RuntimeError):
    pass


@dataclass(frozen=True)
class NormalizeResult:
    playback_path: Path
    peaks_path: Path
    duration_ms: int | None


@dataclass(frozen=True)
class AudioTrackInfo:
    """One audio stream in a container (T-035 S3)."""

    index: int  # 0-based among audio streams (ffmpeg 0:a:N)
    codec: str | None
    language: str | None
    channels: int
    label: str


@dataclass(frozen=True)
class AudioProbe:
    channels: int
    sample_rate: int | None
    duration_ms: int | None
    live_channels: list[int]  # 0-based indices of channels with energy
    audio_tracks: list[AudioTrackInfo] | None = None


@dataclass(frozen=True)
class AsrAudioResult:
    path: Path
    dual_channel: bool
    channels: int
    sample_rate: int
    duration_ms: int | None


def require_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise FfmpegError("ffmpeg not found")
    return exe


def require_ffprobe() -> str:
    exe = shutil.which("ffprobe")
    if not exe:
        raise FfmpegError("ffprobe not found")
    return exe


def list_audio_tracks(src: Path, *, soft_missing: bool = False) -> list[AudioTrackInfo]:
    """List all audio streams (T-035 S3 multi-track video)."""
    try:
        ffprobe = require_ffprobe()
    except FfmpegError:
        if soft_missing:
            return [AudioTrackInfo(0, None, None, 1, "Track 1")]
        raise
    cmd = [
        ffprobe,
        "-protocol_whitelist",
        "file",
        "-v",
        "error",
        "-show_entries",
        "stream=index,codec_type,codec_name,channels:stream_tags=language,title",
        "-of",
        "json",
        str(src),
    ]
    try:
        completed = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        if soft_missing:
            return [AudioTrackInfo(0, None, None, 1, "Track 1")]
        raise FfmpegError("ffprobe tracks failed") from exc
    try:
        payload = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as exc:
        if soft_missing:
            return [AudioTrackInfo(0, None, None, 1, "Track 1")]
        raise FfmpegError("ffprobe tracks json") from exc
    tracks: list[AudioTrackInfo] = []
    for stream in payload.get("streams") or []:
        if stream.get("codec_type") != "audio":
            continue
        a_idx = len(tracks)
        tags = stream.get("tags") or {}
        lang = tags.get("language") if isinstance(tags, dict) else None
        title = tags.get("title") if isinstance(tags, dict) else None
        ch = int(stream.get("channels") or 1)
        codec = stream.get("codec_name")
        parts = [f"Track {a_idx + 1}"]
        if title:
            parts.append(str(title))
        elif lang and str(lang).lower() not in {"und", "unknown"}:
            parts.append(str(lang))
        if codec:
            parts.append(str(codec))
        tracks.append(
            AudioTrackInfo(
                index=a_idx,
                codec=str(codec) if codec else None,
                language=str(lang) if lang else None,
                channels=ch,
                label=" · ".join(parts),
            )
        )
    return tracks or [AudioTrackInfo(0, None, None, 1, "Track 1")]


def probe_audio(
    src: Path,
    *,
    soft_missing: bool = False,
    audio_stream_index: int | None = None,
) -> AudioProbe:
    """Channel count + which channels have energy (T-035 empty-channel / stereo)."""
    try:
        ffprobe = require_ffprobe()
        ffmpeg = require_ffmpeg()
    except FfmpegError:
        if soft_missing:
            return AudioProbe(channels=1, sample_rate=None, duration_ms=None, live_channels=[0])
        raise

    tracks = list_audio_tracks(src, soft_missing=soft_missing)
    stream_sel = f"a:{audio_stream_index}" if audio_stream_index is not None else "a:0"

    cmd = [
        ffprobe,
        "-protocol_whitelist",
        "file",
        "-v",
        "error",
        "-select_streams",
        stream_sel,
        "-show_entries",
        "stream=channels,sample_rate,duration",
        "-of",
        "json",
        str(src),
    ]
    try:
        completed = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        if soft_missing:
            return AudioProbe(
                channels=1,
                sample_rate=None,
                duration_ms=None,
                live_channels=[0],
                audio_tracks=tracks,
            )
        raise FfmpegError("ffprobe audio failed") from exc

    try:
        payload = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as exc:
        if soft_missing:
            return AudioProbe(
                channels=1,
                sample_rate=None,
                duration_ms=None,
                live_channels=[0],
                audio_tracks=tracks,
            )
        raise FfmpegError("ffprobe audio json") from exc
    streams = payload.get("streams") or []
    stream = streams[0] if streams else {}
    channels = int(stream.get("channels") or 1)
    sample_rate = None
    if stream.get("sample_rate"):
        try:
            sample_rate = int(float(stream["sample_rate"]))
        except (TypeError, ValueError):
            sample_rate = None
    duration_ms = None
    if stream.get("duration"):
        try:
            duration_ms = int(float(stream["duration"]) * 1000)
        except (TypeError, ValueError):
            duration_ms = None

    live = _live_channel_indices(ffmpeg, src, channels, audio_stream_index=audio_stream_index)
    if not live:
        live = list(range(max(1, channels)))
    return AudioProbe(
        channels=channels,
        sample_rate=sample_rate,
        duration_ms=duration_ms,
        live_channels=live,
        audio_tracks=tracks,
    )


def _live_channel_indices(
    ffmpeg: str,
    src: Path,
    channels: int,
    *,
    audio_stream_index: int | None = None,
) -> list[int]:
    """Sample ~30s of PCM and mark channels above CHANNEL_LIVE_RMS."""
    if channels <= 1:
        return [0]
    cmd = [
        ffmpeg,
        "-protocol_whitelist",
        "file",
        "-t",
        "30",
        "-i",
        str(src),
    ]
    if audio_stream_index is not None:
        cmd.extend(["-map", f"0:a:{audio_stream_index}"])
    cmd.extend(
        [
            "-vn",
            "-ac",
            str(channels),
            "-ar",
            "8000",
            "-f",
            "s16le",
            "pipe:1",
        ]
    )
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_S)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        return list(range(channels))
    data = proc.stdout or b""
    if len(data) < channels * 2:
        return list(range(channels))
    n_frames = len(data) // (2 * channels)
    sums = [0.0] * channels
    for i in range(n_frames):
        base = i * channels * 2
        for c in range(channels):
            (val,) = struct.unpack_from("<h", data, base + c * 2)
            sums[c] += float(val * val)
    live: list[int] = []
    for c in range(channels):
        rms = math.sqrt(sums[c] / max(1, n_frames))
        if rms >= CHANNEL_LIVE_RMS:
            live.append(c)
    return live


def normalize_for_asr(
    src: Path,
    dest_dir: Path,
    *,
    soft_missing: bool = False,
    dual_channel: bool = False,
    channel_index: int | None = None,
    enable_rnnoise: bool = False,
    audio_stream_index: int | None = None,
) -> AsrAudioResult:
    """16 kHz WAV with highpass + loudnorm for ASR (T-035). Playback stays separate."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / ("asr_stereo.wav" if dual_channel else "asr.wav")
    try:
        ffmpeg = require_ffmpeg()
    except FfmpegError:
        if soft_missing:
            out.write_bytes(b"")
            return AsrAudioResult(
                path=out,
                dual_channel=dual_channel,
                channels=2 if dual_channel else 1,
                sample_rate=ASR_SAMPLE_RATE,
                duration_ms=None,
            )
        raise

    # Filters: high-pass 80 Hz + loudnorm. RNNoise optional (eval gate).
    filters = ["highpass=f=80", "loudnorm=I=-16:TP=-1.5:LRA=11"]
    if enable_rnnoise:
        filters.insert(0, "arnndn")

    cmd = [
        ffmpeg,
        "-protocol_whitelist",
        "file",
        "-y",
        "-i",
        str(src),
    ]
    if audio_stream_index is not None:
        cmd.extend(["-map", f"0:a:{audio_stream_index}"])
    cmd.append("-vn")
    if channel_index is not None:
        cmd.extend(["-af", f"pan=mono|c0=c{channel_index}," + ",".join(filters)])
        cmd.extend(["-ac", "1"])
    elif dual_channel:
        cmd.extend(["-af", ",".join(filters), "-ac", "2"])
    else:
        cmd.extend(["-af", ",".join(filters), "-ac", "1"])
    cmd.extend(["-ar", str(ASR_SAMPLE_RATE), "-c:a", "pcm_s16le", str(out)])

    # Light silence trim as VAD stand-in (Silero deferred — no torch in MVP deps).
    # Applied only on mono path via separate pass would double cost; skip here.

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
        if soft_missing:
            out.write_bytes(b"")
            return AsrAudioResult(
                path=out,
                dual_channel=dual_channel,
                channels=2 if dual_channel else 1,
                sample_rate=ASR_SAMPLE_RATE,
                duration_ms=None,
            )
        raise FfmpegError(exc.stderr or "ffmpeg asr prep failed") from exc

    duration_ms, _ = _peaks_via_pcm(ffmpeg, out, buckets=20)
    return AsrAudioResult(
        path=out,
        dual_channel=dual_channel,
        channels=2 if dual_channel else 1,
        sample_rate=ASR_SAMPLE_RATE,
        duration_ms=duration_ms,
    )


def mix_audio_files(
    sources: list[Path],
    dest_dir: Path,
    *,
    soft_missing: bool = False,
) -> NormalizeResult:
    """Mix N mono/stereo inputs into one AAC playback (T-035b Zoom tracks)."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    playback = dest_dir / "playback.m4a"
    peaks = dest_dir / "peaks.json"
    if not sources:
        raise FfmpegError("no sources to mix")
    if len(sources) == 1:
        return normalize_to_playback(sources[0], dest_dir, soft_missing=soft_missing)

    try:
        ffmpeg = require_ffmpeg()
    except FfmpegError:
        if soft_missing:
            playback.write_bytes(b"")
            peaks.write_text(json.dumps({"peaks": [], "duration_ms": None}), encoding="utf-8")
            return NormalizeResult(playback, peaks, None)
        raise

    cmd = [ffmpeg, "-protocol_whitelist", "file", "-y"]
    for src in sources:
        cmd.extend(["-i", str(src)])
    n = len(sources)
    # amix → mono AAC
    filter_complex = (
        "".join(f"[{i}:a]" for i in range(n)) + f"amix=inputs={n}:duration=longest[aout]"
    )
    cmd.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[aout]",
            "-ac",
            "1",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            str(playback),
        ]
    )
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
        if soft_missing:
            playback.write_bytes(b"")
            peaks.write_text(json.dumps({"peaks": [], "duration_ms": None}), encoding="utf-8")
            return NormalizeResult(playback, peaks, None)
        raise FfmpegError(exc.stderr or "ffmpeg mix failed") from exc

    duration_ms, peak_vals = _peaks_via_pcm(ffmpeg, playback)
    peaks.write_text(
        json.dumps({"peaks": peak_vals, "duration_ms": duration_ms}),
        encoding="utf-8",
    )
    return NormalizeResult(playback, peaks, duration_ms)


def normalize_to_playback(
    src: Path,
    dest_dir: Path,
    *,
    soft_missing: bool = False,
    audio_stream_index: int | None = None,
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
    ]
    if audio_stream_index is not None:
        cmd.extend(["-map", f"0:a:{audio_stream_index}"])
    cmd.extend(
        [
            "-vn",
            "-ac",
            "1",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            str(playback),
        ]
    )
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
