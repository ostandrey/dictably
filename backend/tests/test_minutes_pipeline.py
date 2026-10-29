"""T-016a: quote validation, fabricated drops, two-pass verify, eval smoke."""

from __future__ import annotations

import pytest

from dictably.domain.minutes_pipeline import run_minutes_pipeline
from dictably.domain.minutes_schema import (
    validate_minutes,
)
from dictably.eval.metrics import score_case
from dictably.eval.runner import run_eval
from dictably.providers.llm.fake import FakeLLMProvider


def test_validate_drops_fabricated_quote() -> None:
    segments = [
        {
            "id": "S1",
            "start_ms": 0,
            "end_ms": 1000,
            "text": "We will ship Friday.",
            "speaker_id": "A",
        },
        {"id": "S2", "start_ms": 1000, "end_ms": 2000, "text": "Sounds good.", "speaker_id": "B"},
    ]
    raw = {
        "language": "en",
        "title": "T",
        "parties": [{"id": "our", "label": "Our"}],
        "participants": [],
        "summary": [],
        "decisions": [],
        "agreements": [
            {
                "party_id": "our",
                "text": "Invented commitment",
                "segment_ids": ["S1"],
                "quote": "totally made up words not in transcript",
                "status": "agreed",
            },
            {
                "party_id": "our",
                "text": "Ship Friday",
                "segment_ids": ["S1"],
                "quote": "We will ship Friday",
                "status": "agreed",
            },
        ],
        "tasks": [],
        "deadlines_and_facts": [],
        "open_questions": [],
    }
    cleaned, dropped = validate_minutes(segments, raw, require_quote=True)
    assert len(cleaned.agreements) == 1
    assert cleaned.agreements[0].text == "Ship Friday"
    assert any("quote mismatch" in d for d in dropped)


def test_validate_legacy_without_quote_flag() -> None:
    segments = [
        {"id": "S1", "start_ms": 0, "end_ms": 1000, "text": "one"},
        {"id": "S2", "start_ms": 1000, "end_ms": 2000, "text": "two"},
    ]
    raw = {
        "language": "en",
        "title": "T",
        "parties": [{"id": "our", "label": "Our"}],
        "participants": [],
        "summary": [{"text": "ok", "segment_ids": ["S1"]}],
        "agreements": [{"party_id": "our", "text": "ok agree", "segment_ids": ["S2"]}],
        "tasks": [],
        "decisions": [],
        "deadlines_and_facts": [],
        "open_questions": [],
    }
    cleaned, dropped = validate_minutes(segments, raw, require_quote=False)
    assert len(cleaned.summary) == 1
    assert len(cleaned.agreements) == 1
    assert not any("quote" in d for d in dropped)


@pytest.mark.asyncio
async def test_pipeline_fake_marks_supported() -> None:
    llm = FakeLLMProvider()
    transcript = {
        "language": "en",
        "parties": [{"id": "our", "label": "Our"}, {"id": "their", "label": "Their"}],
        "speakers": [
            {"label": "A", "display_name": "Ann", "party": "our"},
            {"label": "B", "display_name": "Ben", "party": "their"},
        ],
        "segments": [
            {
                "id": "S1",
                "start_ms": 0,
                "end_ms": 2000,
                "speaker_id": "A",
                "text": "We will update the table next week.",
            },
            {
                "id": "S2",
                "start_ms": 2000,
                "end_ms": 4000,
                "speaker_id": "B",
                "text": "I will send the assets by Wednesday.",
            },
        ],
    }
    raw = await run_minutes_pipeline(llm, transcript=transcript, require_quote=True)
    assert raw["agreements"]
    assert raw["agreements"][0]["quote"]
    assert raw["agreements"][0]["verify"] == "supported"
    assert raw.get("prompt_version")


@pytest.mark.asyncio
async def test_eval_synthetic_runs() -> None:
    report = await run_eval(include_synthetic=True)
    assert report["summary"]["cases"] >= 5
    # Fake provider does not match gold text — harness must still complete.
    assert "mean_found_rate" in report["summary"]


def test_score_case_detects_fabricated() -> None:
    gold = {
        "agreements": [{"party_id": "our", "text": "Ship Friday", "segment_ids": ["S1"]}],
        "tasks": [],
        "decisions": [],
    }
    predicted = {
        "agreements": [
            {
                "party_id": "our",
                "text": "Ship Friday",
                "segment_ids": ["S1"],
                "verify": "supported",
            },
            {
                "party_id": "our",
                "text": "Totally invented item",
                "segment_ids": ["S9"],
                "verify": "supported",
            },
        ],
        "tasks": [],
        "decisions": [],
    }
    m = score_case(gold, predicted)
    assert m["found"] == 1
    assert m["fabricated"] == 1


class _BoomVerify(FakeLLMProvider):
    async def verify(
        self,
        *,
        items: list[dict],
        language: str,
    ) -> dict:
        del items, language
        raise TimeoutError("verify timed out")


@pytest.mark.asyncio
async def test_verify_failure_soft_marks_weak() -> None:
    """S3: pass-2 error keeps extract results as weak, does not raise."""
    llm = _BoomVerify()
    transcript = {
        "language": "en",
        "parties": [{"id": "our", "label": "Our"}, {"id": "their", "label": "Their"}],
        "speakers": [
            {"label": "A", "display_name": "Ann", "party": "our"},
            {"label": "B", "display_name": "Ben", "party": "their"},
        ],
        "segments": [
            {
                "id": "S1",
                "start_ms": 0,
                "end_ms": 2000,
                "speaker_id": "A",
                "text": "We will update the table next week.",
            },
            {
                "id": "S2",
                "start_ms": 2000,
                "end_ms": 4000,
                "speaker_id": "B",
                "text": "I will send the assets by Wednesday.",
            },
        ],
    }
    raw = await run_minutes_pipeline(llm, transcript=transcript, require_quote=True)
    assert raw["agreements"]
    assert all(a.get("verify") == "weak" for a in raw["agreements"])
    assert all(a.get("verify_reason") == "не вдалося перевірити" for a in raw["agreements"])
