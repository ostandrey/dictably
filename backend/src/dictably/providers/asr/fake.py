from __future__ import annotations

from typing import Any


class FakeASRProvider:
    name = "fake"

    async def transcribe(
        self,
        *,
        audio_path: str,
        language: str | None = None,
        speakers_expected: int | None = None,
        word_boost: list[str] | None = None,
        dual_channel: bool = False,
    ) -> dict[str, Any]:
        lang = language or "en"
        if dual_channel:
            return self._dual(lang=lang, audio_path=audio_path)
        speakers = [
            {"id": "A", "label": "A", "display_name": "Speaker A", "color_idx": 0},
            {"id": "B", "label": "B", "display_name": "Speaker B", "color_idx": 1},
        ]
        if speakers_expected == 1:
            speakers = speakers[:1]
        boost_note = ""
        if word_boost:
            boost_note = f" {' '.join(word_boost[:3])}"
        return {
            "provider": self.name,
            "model": "fake-v0",
            "language": lang,
            "duration_ms": 30_000,
            "speakers": speakers,
            "segments": [
                {
                    "id": "S1",
                    "speaker_id": "A",
                    "start_ms": 0,
                    "end_ms": 4_000,
                    "text": f"Fake transcript segment one.{boost_note}".strip(),
                },
                {
                    "id": "S2",
                    "speaker_id": "B" if len(speakers) > 1 else "A",
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
                {
                    "text": "Fake",
                    "start_ms": 4500,
                    "end_ms": 5000,
                    "speaker_id": "B" if len(speakers) > 1 else "A",
                },
                {
                    "text": "transcript",
                    "start_ms": 5000,
                    "end_ms": 6000,
                    "speaker_id": "B" if len(speakers) > 1 else "A",
                },
                {
                    "text": "segment",
                    "start_ms": 6000,
                    "end_ms": 7500,
                    "speaker_id": "B" if len(speakers) > 1 else "A",
                },
                {
                    "text": "two.",
                    "start_ms": 7500,
                    "end_ms": 9000,
                    "speaker_id": "B" if len(speakers) > 1 else "A",
                },
                {"text": "We", "start_ms": 12000, "end_ms": 12500, "speaker_id": "A"},
                {"text": "agreed", "start_ms": 12500, "end_ms": 13200, "speaker_id": "A"},
                {"text": "to", "start_ms": 13200, "end_ms": 13500, "speaker_id": "A"},
                {"text": "update", "start_ms": 13500, "end_ms": 14200, "speaker_id": "A"},
                {"text": "the", "start_ms": 14200, "end_ms": 14500, "speaker_id": "A"},
                {"text": "table.", "start_ms": 14500, "end_ms": 16000, "speaker_id": "A"},
            ],
            "source_path": audio_path,
        }

    def _dual(self, *, lang: str, audio_path: str) -> dict[str, Any]:
        """Stereo dual-channel → speakers L and R (AC: stereo call → 2 correct speakers)."""
        return {
            "provider": self.name,
            "model": "fake-v0-dual",
            "language": lang,
            "duration_ms": 20_000,
            "speakers": [
                {"id": "L", "label": "L", "display_name": "Left", "color_idx": 0},
                {"id": "R", "label": "R", "display_name": "Right", "color_idx": 1},
            ],
            "segments": [
                {
                    "id": "S1",
                    "speaker_id": "L",
                    "start_ms": 0,
                    "end_ms": 5_000,
                    "text": "Hello from the left channel.",
                },
                {
                    "id": "S2",
                    "speaker_id": "R",
                    "start_ms": 5_500,
                    "end_ms": 10_000,
                    "text": "Reply from the right channel.",
                },
            ],
            "words": [
                {"text": "Hello", "start_ms": 0, "end_ms": 500, "speaker_id": "L"},
                {"text": "from", "start_ms": 500, "end_ms": 900, "speaker_id": "L"},
                {"text": "the", "start_ms": 900, "end_ms": 1100, "speaker_id": "L"},
                {"text": "left", "start_ms": 1100, "end_ms": 1600, "speaker_id": "L"},
                {"text": "channel.", "start_ms": 1600, "end_ms": 5000, "speaker_id": "L"},
                {"text": "Reply", "start_ms": 5500, "end_ms": 6000, "speaker_id": "R"},
                {"text": "from", "start_ms": 6000, "end_ms": 6400, "speaker_id": "R"},
                {"text": "the", "start_ms": 6400, "end_ms": 6600, "speaker_id": "R"},
                {"text": "right", "start_ms": 6600, "end_ms": 7200, "speaker_id": "R"},
                {"text": "channel.", "start_ms": 7200, "end_ms": 10000, "speaker_id": "R"},
            ],
            "source_path": audio_path,
            "dual_channel": True,
        }
