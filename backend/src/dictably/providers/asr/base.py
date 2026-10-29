from __future__ import annotations

from typing import Any, Protocol


class TranscriptionProvider(Protocol):
    """ASR behind a Protocol — routers never call this directly (AGENTS.md)."""

    name: str

    async def transcribe(
        self,
        *,
        audio_path: str,
        language: str | None = None,
        speakers_expected: int | None = None,
        word_boost: list[str] | None = None,
        dual_channel: bool = False,
    ) -> dict[str, Any]:
        """Return normalized transcript JSON (segments / words / speakers)."""
        ...
