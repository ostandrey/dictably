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
            "speakers": [
                {"id": "A", "label": "A", "display_name": "Speaker A", "color_idx": 0},
                {"id": "B", "label": "B", "display_name": "Speaker B", "color_idx": 1},
            ],
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
                {
                    "id": "S3",
                    "speaker_id": "A",
                    "start_ms": 12_000,
                    "end_ms": 16_000,
                    "text": "We agreed to update the table.",
                },
            ],
            "words": [
                {"text": "Fake", "start_ms": 0, "end_ms": 400, "speaker_id": "A"},
                {"text": "transcript", "start_ms": 400, "end_ms": 1200, "speaker_id": "A"},
                {"text": "segment", "start_ms": 1200, "end_ms": 2000, "speaker_id": "A"},
                {"text": "one.", "start_ms": 2000, "end_ms": 4000, "speaker_id": "A"},
                {"text": "Fake", "start_ms": 4500, "end_ms": 5000, "speaker_id": "B"},
                {"text": "transcript", "start_ms": 5000, "end_ms": 6000, "speaker_id": "B"},
                {"text": "segment", "start_ms": 6000, "end_ms": 7500, "speaker_id": "B"},
                {"text": "two.", "start_ms": 7500, "end_ms": 9000, "speaker_id": "B"},
                {"text": "We", "start_ms": 12000, "end_ms": 12500, "speaker_id": "A"},
                {"text": "agreed", "start_ms": 12500, "end_ms": 13200, "speaker_id": "A"},
                {"text": "to", "start_ms": 13200, "end_ms": 13500, "speaker_id": "A"},
                {"text": "update", "start_ms": 13500, "end_ms": 14200, "speaker_id": "A"},
                {"text": "the", "start_ms": 14200, "end_ms": 14500, "speaker_id": "A"},
                {"text": "table.", "start_ms": 14500, "end_ms": 16000, "speaker_id": "A"},
            ],
            "source_path": audio_path,
        }
