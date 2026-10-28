from __future__ import annotations

from typing import Any


class FakeLLMProvider:
    name = "fake"

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        segments = list(transcript.get("segments") or [])
        seg_ids = [str(s.get("id")) for s in segments[:2] if isinstance(s, dict) and s.get("id")]
        if not seg_ids:
            seg_ids = ["S1"]
        first = seg_ids[0]
        lang = str(transcript.get("language") or "en")
        assigned = [
            p for p in (transcript.get("parties") or []) if isinstance(p, dict) and p.get("id")
        ]
        parties = assigned or [
            {"id": "our", "label": "Our side"},
            {"id": "their", "label": "Their side"},
        ]
        speakers = [s for s in (transcript.get("speakers") or []) if isinstance(s, dict)]
        participants = []
        for i, sp in enumerate(speakers[:4] or [{"label": "A"}, {"label": "B"}]):
            label = str(sp.get("label") or sp.get("id") or ("A" if i == 0 else "B"))
            party_id = str(sp.get("party") or parties[min(i, len(parties) - 1)]["id"])
            participants.append(
                {
                    "speaker": label,
                    "suggested_name": (sp.get("display_name") or label),
                    "suggested_role": None,
                    "party_id": party_id,
                }
            )
        if not participants:
            participants = [
                {
                    "speaker": "A",
                    "suggested_name": "Speaker A",
                    "suggested_role": None,
                    "party_id": parties[0]["id"],
                },
                {
                    "speaker": "B",
                    "suggested_name": "Speaker B",
                    "suggested_role": None,
                    "party_id": parties[min(1, len(parties) - 1)]["id"],
                },
            ]
        return {
            "provider": self.name,
            "model": "fake-v0",
            "language": lang,
            "title": "Fake meeting minutes",
            "parties": parties,
            "participants": participants,
            "summary": [
                {
                    "text": "Fake meeting summary point.",
                    "segment_ids": [first],
                }
            ],
            "decisions": [],
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Fake agreement to update the table.",
                    "segment_ids": seg_ids[-1:],
                }
            ],
            "tasks": [
                {
                    "party_id": "their",
                    "text": "Fake follow-up task.",
                    "segment_ids": [first],
                    "owner_speaker": "B",
                    "due_text": None,
                }
            ],
            "deadlines_and_facts": [],
            "open_questions": [],
        }
