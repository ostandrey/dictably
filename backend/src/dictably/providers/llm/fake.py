from __future__ import annotations

from typing import Any


class FakeLLMProvider:
    name = "fake"

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        seg_ids = [s["id"] for s in transcript.get("segments", [])[:1]] or ["S1"]
        return {
            "provider": self.name,
            "model": "fake-v0",
            "language": transcript.get("language", "en"),
            "summary": ["Fake meeting summary."],
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Fake agreement.",
                    "segment_ids": seg_ids,
                }
            ],
            "tasks": [],
            "deadlines_and_facts": [],
            "open_questions": [],
        }
