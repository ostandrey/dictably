"""Synthetic eval fixtures (CI). Owner real cases live under docs/eval/cases/."""

from __future__ import annotations

from typing import Any

# Five short synthetic meetings with gold agreements/tasks.
FIXTURES: list[dict[str, Any]] = [
    {
        "id": "syn-budget",
        "language": "en",
        "transcript": {
            "language": "en",
            "parties": [
                {"id": "our", "label": "Support"},
                {"id": "their", "label": "Client"},
            ],
            "speakers": [
                {"label": "A", "display_name": "Iryna", "party": "our"},
                {"label": "B", "display_name": "Mark", "party": "their"},
            ],
            "segments": [
                {
                    "id": "S1",
                    "start_ms": 0,
                    "end_ms": 4000,
                    "speaker_id": "A",
                    "text": "We can ship the table update next Friday.",
                },
                {
                    "id": "S2",
                    "start_ms": 4000,
                    "end_ms": 8000,
                    "speaker_id": "B",
                    "text": "Agreed. Mark will send the brand assets by Wednesday.",
                },
                {
                    "id": "S3",
                    "start_ms": 8000,
                    "end_ms": 12000,
                    "speaker_id": "A",
                    "text": "If the budget is approved we will also add analytics.",
                },
            ],
        },
        "gold": {
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Ship the table update next Friday",
                    "segment_ids": ["S1"],
                }
            ],
            "tasks": [
                {
                    "party_id": "their",
                    "text": "Send the brand assets by Wednesday",
                    "segment_ids": ["S2"],
                }
            ],
            "decisions": [],
        },
    },
    {
        "id": "syn-reject",
        "language": "en",
        "transcript": {
            "language": "en",
            "parties": [{"id": "our", "label": "Us"}, {"id": "their", "label": "Them"}],
            "speakers": [
                {"label": "A", "display_name": "Olena", "party": "our"},
                {"label": "B", "display_name": "Pavlo", "party": "their"},
            ],
            "segments": [
                {
                    "id": "S1",
                    "start_ms": 0,
                    "end_ms": 3000,
                    "speaker_id": "B",
                    "text": "Please deliver the report tomorrow.",
                },
                {
                    "id": "S2",
                    "start_ms": 3000,
                    "end_ms": 6000,
                    "speaker_id": "A",
                    "text": "We will not deliver the report tomorrow.",
                },
            ],
        },
        "gold": {
            "agreements": [],
            "tasks": [],
            "decisions": [
                {
                    "text": "Will not deliver the report tomorrow",
                    "segment_ids": ["S2"],
                }
            ],
        },
    },
    {
        "id": "syn-uk",
        "language": "uk",
        "transcript": {
            "language": "uk",
            "parties": [
                {"id": "our", "label": "Наша сторона"},
                {"id": "their", "label": "Клієнт"},
            ],
            "speakers": [
                {"label": "A", "display_name": "Ірина", "party": "our"},
                {"label": "B", "display_name": "Олег", "party": "their"},
            ],
            "segments": [
                {
                    "id": "S1",
                    "start_ms": 0,
                    "end_ms": 5000,
                    "speaker_id": "A",
                    "text": "Ми надішлемо протокол до п'ятниці.",
                },
                {
                    "id": "S2",
                    "start_ms": 5000,
                    "end_ms": 9000,
                    "speaker_id": "B",
                    "text": "Добре, я підтверджу отримання того ж дня.",
                },
            ],
        },
        "gold": {
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Надіслати протокол до п'ятниці",
                    "segment_ids": ["S1"],
                }
            ],
            "tasks": [
                {
                    "party_id": "their",
                    "text": "Підтвердити отримання того ж дня",
                    "segment_ids": ["S2"],
                }
            ],
            "decisions": [],
        },
    },
    {
        "id": "syn-change-later",
        "language": "en",
        "transcript": {
            "language": "en",
            "parties": [{"id": "our", "label": "Us"}, {"id": "their", "label": "Them"}],
            "speakers": [
                {"label": "A", "display_name": "Ann", "party": "our"},
                {"label": "B", "display_name": "Ben", "party": "their"},
            ],
            "segments": [
                {
                    "id": "S1",
                    "start_ms": 0,
                    "end_ms": 4000,
                    "speaker_id": "A",
                    "text": "Let's meet on Monday at ten.",
                },
                {
                    "id": "S2",
                    "start_ms": 40_000,
                    "end_ms": 45_000,
                    "speaker_id": "B",
                    "text": "Actually, Monday does not work. Let's meet on Tuesday at ten.",
                },
                {
                    "id": "S3",
                    "start_ms": 45_000,
                    "end_ms": 48_000,
                    "speaker_id": "A",
                    "text": "Tuesday at ten works for me.",
                },
            ],
        },
        "gold": {
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Meet on Tuesday at ten",
                    "segment_ids": ["S2", "S3"],
                }
            ],
            "tasks": [],
            "decisions": [],
        },
    },
    {
        "id": "syn-silent-ok",
        "language": "en",
        "transcript": {
            "language": "en",
            "parties": [{"id": "our", "label": "Us"}, {"id": "their", "label": "Them"}],
            "speakers": [
                {"label": "A", "display_name": "Ann", "party": "our"},
                {"label": "B", "display_name": "Ben", "party": "their"},
            ],
            "segments": [
                {
                    "id": "S1",
                    "start_ms": 0,
                    "end_ms": 4000,
                    "speaker_id": "A",
                    "text": "So we keep the current pricing for Q1.",
                },
                {
                    "id": "S2",
                    "start_ms": 4000,
                    "end_ms": 6000,
                    "speaker_id": "B",
                    "text": "Ok, then so.",
                },
            ],
        },
        "gold": {
            "agreements": [],
            "tasks": [],
            "decisions": [
                {
                    "text": "Keep the current pricing for Q1",
                    "segment_ids": ["S1", "S2"],
                }
            ],
        },
    },
]
