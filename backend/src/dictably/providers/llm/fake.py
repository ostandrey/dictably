from __future__ import annotations

from typing import Any


class FakeLLMProvider:
    """Deterministic two-pass provider for tests (quotes match segment text)."""

    name = "fake"

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        return await self.extract(
            transcript=transcript,
            user_message="",
            language=str(transcript.get("language") or "en"),
        )

    async def extract(
        self,
        *,
        transcript: dict[str, Any],
        user_message: str,
        language: str,
        template: str = "default",
    ) -> dict[str, Any]:
        del user_message
        from dictably.domain.minutes_templates import (
            TEMPLATE_OFFICIAL,
            normalize_template,
        )

        tid = normalize_template(template or transcript.get("template"))
        segments = list(transcript.get("segments") or [])
        seg_ids = [str(s.get("id")) for s in segments[:2] if isinstance(s, dict) and s.get("id")]
        if not seg_ids:
            seg_ids = ["S1"]
        first = seg_ids[0]
        last = seg_ids[-1]
        texts = {
            str(s.get("id")): str(s.get("text") or "")
            for s in segments
            if isinstance(s, dict) and s.get("id")
        }
        quote_first = _quote_from(texts.get(first, "Fake meeting summary point."))
        quote_last = _quote_from(texts.get(last, "Fake agreement to update the table."))
        lang = language or str(transcript.get("language") or "en")
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
        base = {
            "provider": self.name,
            "model": "fake-v2",
            "prompt_version": "v4-protocol-2026-10-30",
            "cost_usd": 0.0,
            "language": lang,
            "template": tid,
            "title": (
                "Fake official protocol" if tid == TEMPLATE_OFFICIAL else "Fake meeting minutes"
            ),
            "parties": parties,
            "participants": participants,
            "summary": [
                {
                    "text": "Fake meeting summary point.",
                    "segment_ids": [first],
                    "quote": quote_first,
                    "status": "agreed",
                }
            ],
            "agenda": [],
            "heard": [],
            "decisions": [],
            "agreements": [
                {
                    "party_id": parties[0]["id"],
                    "text": "Fake agreement to update the table.",
                    "segment_ids": [last],
                    "quote": quote_last,
                    "status": "agreed",
                }
            ],
            "tasks": [
                {
                    "party_id": parties[min(1, len(parties) - 1)]["id"],
                    "text": "Fake follow-up task.",
                    "segment_ids": [first],
                    "quote": quote_first,
                    "owner_speaker": participants[-1]["speaker"],
                    "due_text": None,
                    "status": "agreed",
                }
            ],
            "deadlines_and_facts": [],
            "open_questions": [],
        }
        if tid == TEMPLATE_OFFICIAL:
            base["summary"] = []
            base["agreements"] = []
            base["agenda"] = [
                {
                    "item_id": "A1",
                    "text": "Fake agenda item one.",
                    "segment_ids": [first],
                    "quote": quote_first,
                    "status": "agreed",
                }
            ]
            base["heard"] = [
                {
                    "text": "Fake heard presentation.",
                    "segment_ids": [first],
                    "quote": quote_first,
                    "status": "agreed",
                    "agenda_ref": "A1",
                }
            ]
            base["decisions"] = [
                {
                    "text": "Fake decision adopted.",
                    "segment_ids": [last],
                    "quote": quote_last,
                    "status": "agreed",
                    "agenda_ref": "A1",
                }
            ]
            base["tasks"] = [
                {
                    "party_id": parties[min(1, len(parties) - 1)]["id"],
                    "text": "Fake follow-up task.",
                    "segment_ids": [first],
                    "quote": quote_first,
                    "owner_speaker": participants[-1]["speaker"],
                    "due_text": None,
                    "status": "agreed",
                    "agenda_ref": "A1",
                }
            ]
        return base

    async def verify(
        self,
        *,
        items: list[dict[str, Any]],
        language: str,
    ) -> dict[str, Any]:
        del language
        out = []
        for it in items:
            text = str(it.get("text") or "")
            # Synthetic hook for unit tests: mark fabricated items.
            if text.startswith("FABRICATED:"):
                out.append(
                    {
                        "item_id": it["item_id"],
                        "verdict": "not_supported",
                        "party_ok": True,
                        "due_ok": True,
                        "reason": "fabricated fixture",
                    }
                )
            elif "WEAK:" in text:
                out.append(
                    {
                        "item_id": it["item_id"],
                        "verdict": "weak",
                        "party_ok": True,
                        "due_ok": True,
                        "reason": "soft evidence",
                    }
                )
            else:
                out.append(
                    {
                        "item_id": it["item_id"],
                        "verdict": "supported",
                        "party_ok": True,
                        "due_ok": True,
                        "reason": "",
                    }
                )
        return {"items": out}


def _quote_from(text: str) -> str:
    words = text.split()
    if not words:
        return "placeholder"
    # Must be a contiguous substring of the cited segment(s) for code validation.
    return " ".join(words[: min(12, len(words))])
