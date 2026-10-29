"""Parse speaker display names from Zoom per-participant audio filenames (T-035b)."""

from __future__ import annotations

import re
from pathlib import Path

# Zoom often: audioOlena.m4a, audio_John_Smith.m4a, audioJohn Smith.m4a
_AUDIO_PREFIX = re.compile(r"^audio[\s_\-]*", re.IGNORECASE)
# GMT20240115-xxx or similar recording stamps
_GMT_PREFIX = re.compile(r"^GMT\d{8}[-_]?", re.IGNORECASE)
_NOISE = re.compile(r"[\s_\-]+")


def speaker_name_from_filename(filename: str | None) -> str:
    """Best-effort name from a Zoom (or similar) per-participant file."""
    stem = Path(filename or "Speaker").stem.strip()
    if not stem:
        return "Speaker"
    name = _GMT_PREFIX.sub("", stem)
    name = _AUDIO_PREFIX.sub("", name)
    name = _NOISE.sub(" ", name).strip(" .-_")
    if not name:
        return "Speaker"
    # Title-case if all lower / all upper
    if name.islower() or name.isupper():
        name = name.title()
    return name[:200]
