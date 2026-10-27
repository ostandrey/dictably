from __future__ import annotations

from typing import Any


class FakeASRProvider:
    name = "fake"

    async def transcribe(self, *, audio_path: str, language: str | None = None) -> dict[str, Any]:
        lang = language or "en"
        return {
            "provider": self.name,
            "model": "fake-v0",
            "language": lang,
            "duration_ms": 30_000,
            "speakers": [{"id": "A", "label": "A"}, {"id": "B", "label": "B"}],
            "segments": [
                {
                    "id": "S1",
                    "speaker_id": "A",
                    "start_ms": 0,
                    "end_ms": 4_000,
                    "text": "Fake transcript segment one.",
                },
                {
                    "id": "S2",
                    "speaker_id": "B",
                    "start_ms": 4_500,
                    "end_ms": 9_000,
                    "text": "Fake transcript segment two.",
                },
            ],
            "words": [],
            "source_path": audio_path,
        }
