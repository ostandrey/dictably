from __future__ import annotations

import shutil
import struct
import subprocess
import wave
from pathlib import Path


class AudioError(RuntimeError):
    pass


def require_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise AudioError(
            "ffmpeg not found on PATH. Install ffmpeg to convert recordings "
            "(fixture mode does not need it)."
        )
    return exe


def to_mono_m4a(src: Path, dest: Path) -> Path:
    """ffmpeg -> mono m4a 64 kbps (DEMO-KIT.md)."""
    ffmpeg = require_ffmpeg()
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        str(dest),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise AudioError(e.stderr or str(e)) from e
    return dest


def write_silent_wav(
    dest: Path,
    duration_s: float = 14.0,
    *,
    rate: int = 8000,
    sampwidth: int = 1,
) -> Path:
    """Silent WAV for fixture HTML — full duration at 8 kHz / 8-bit (S5)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    n_frames = max(1, int(duration_s * rate))
    with wave.open(str(dest), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(sampwidth)
        w.setframerate(rate)
        if sampwidth == 1:
            # unsigned 8-bit silence
            w.writeframes(bytes([128]) * n_frames)
        else:
            w.writeframes(struct.pack("<" + "h" * n_frames, *([0] * n_frames)))
    return dest
