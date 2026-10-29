"""Generate official-protocol PDF samples for T-027 review (EN + UK labels).

uv run python scripts/gen_t027_protocol_samples.py [outdir]
# or Docker API image with WeasyPrint
"""

from __future__ import annotations

import sys
from datetime import UTC, date, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from dictably.domain.export import ExportCtx, _labels_for, minutes_pdf, weasyprint_available
from dictably.domain.minutes_schema import Minutes

MEDIA_ID = UUID("22222222-2222-2222-2222-222222222222")


def _official(lang: str) -> Minutes:
    if lang == "uk":
        return Minutes.model_validate(
            {
                "language": "uk",
                "title": "Протокол наради — бюджет Q4",
                "template": "official_protocol",
                "parties": [{"id": "our", "label": "Наші"}],
                "participants": [
                    {
                        "speaker": "A",
                        "suggested_name": "Олена Коваль",
                        "party_id": "our",
                    },
                    {
                        "speaker": "B",
                        "suggested_name": "Андрій Петренко",
                        "party_id": "our",
                    },
                ],
                "agenda": [
                    {
                        "item_id": "A1",
                        "text": "Бюджет на Q4",
                        "segment_ids": ["S1"],
                        "quote": "бюджет",
                        "start_ms": 90_000,
                    },
                    {
                        "item_id": "A2",
                        "text": "Найм аналітика",
                        "segment_ids": ["S2"],
                        "quote": "аналітика",
                        "start_ms": 180_000,
                    },
                ],
                "heard": [
                    {
                        "text": "Олена доповіла кошторис.",
                        "agenda_ref": "A1",
                        "segment_ids": ["S1"],
                        "quote": "кошторис",
                        "start_ms": 95_000,
                    },
                    {
                        "text": "Андрій запропонував кандидата.",
                        "agenda_ref": "A2",
                        "segment_ids": ["S2"],
                        "quote": "кандидата",
                        "start_ms": 185_000,
                    },
                ],
                "decisions": [
                    {
                        "text": "Затвердити кошторис.",
                        "agenda_ref": "A1",
                        "segment_ids": ["S1"],
                        "quote": "Затвердити",
                        "start_ms": 120_000,
                    },
                    {
                        "text": "Відкрити вакансію.",
                        "agenda_ref": "A2",
                        "segment_ids": ["S2"],
                        "quote": "вакансію",
                        "start_ms": 200_000,
                    },
                ],
                "tasks": [
                    {
                        "party_id": "our",
                        "text": "Надіслати таблицю фінансам",
                        "agenda_ref": "A1",
                        "segment_ids": ["S1"],
                        "quote": "таблицю",
                        "owner_speaker": "A",
                        "due_text": "п'ятниця",
                        "start_ms": 130_000,
                    }
                ],
                "open_questions": [
                    {
                        "text": "Чи потрібен окремий Zoom?",
                        "segment_ids": ["S2"],
                        "quote": "Zoom",
                        "start_ms": 210_000,
                    }
                ],
            }
        )
    return Minutes.model_validate(
        {
            "language": "en",
            "title": "Minutes of meeting — Q4 budget",
            "template": "official_protocol",
            "parties": [{"id": "our", "label": "Our side"}],
            "participants": [
                {"speaker": "A", "suggested_name": "Olena Koval", "party_id": "our"},
                {
                    "speaker": "B",
                    "suggested_name": "Andriy Petrenko",
                    "party_id": "our",
                },
            ],
            "agenda": [
                {
                    "item_id": "A1",
                    "text": "Q4 budget",
                    "segment_ids": ["S1"],
                    "quote": "budget",
                    "start_ms": 90_000,
                },
                {
                    "item_id": "A2",
                    "text": "Hiring an analyst",
                    "segment_ids": ["S2"],
                    "quote": "analyst",
                    "start_ms": 180_000,
                },
            ],
            "heard": [
                {
                    "text": "Olena presented the estimate.",
                    "agenda_ref": "A1",
                    "segment_ids": ["S1"],
                    "quote": "estimate",
                    "start_ms": 95_000,
                },
                {
                    "text": "Andriy proposed a candidate.",
                    "agenda_ref": "A2",
                    "segment_ids": ["S2"],
                    "quote": "candidate",
                    "start_ms": 185_000,
                },
            ],
            "decisions": [
                {
                    "text": "Approve the estimate.",
                    "agenda_ref": "A1",
                    "segment_ids": ["S1"],
                    "quote": "Approve",
                    "start_ms": 120_000,
                },
                {
                    "text": "Open the role.",
                    "agenda_ref": "A2",
                    "segment_ids": ["S2"],
                    "quote": "Open",
                    "start_ms": 200_000,
                },
            ],
            "tasks": [
                {
                    "party_id": "our",
                    "text": "Send the spreadsheet to finance",
                    "agenda_ref": "A1",
                    "segment_ids": ["S1"],
                    "quote": "spreadsheet",
                    "owner_speaker": "A",
                    "due_text": "Friday",
                    "start_ms": 130_000,
                }
            ],
            "open_questions": [
                {
                    "text": "Do we need a separate Zoom?",
                    "segment_ids": ["S2"],
                    "quote": "Zoom",
                    "start_ms": 210_000,
                }
            ],
        }
    )


def _ctx(lang: str) -> ExportCtx:
    media = SimpleNamespace(
        id=MEDIA_ID,
        filename="q4-budget.m4a",
        created_at=datetime(2026, 10, 20, 9, 0, tzinfo=UTC),
        meeting_date=date(2026, 10, 18),
        duration_ms=35 * 60 * 1000,
        language=lang,
    )
    speakers = [
        SimpleNamespace(label="A", display_name="Olena Koval", party="our"),
        SimpleNamespace(label="B", display_name="Andriy Petrenko", party="our"),
    ]
    prefix = "/uk" if lang == "uk" else ""
    return ExportCtx(
        media=media,  # type: ignore[arg-type]
        speakers=speakers,  # type: ignore[arg-type]
        minutes=_official(lang),
        locale=lang,
        labels=_labels_for(lang),
        base_url="https://dictably.example",
        recording_path=f"{prefix}/app/r/?id={MEDIA_ID}",
    )


def main() -> None:
    if not weasyprint_available():
        print("WeasyPrint unavailable — skip PDF samples", file=sys.stderr)
        sys.exit(0)
    out = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else Path(__file__).resolve().parents[2] / "web" / "e2e" / "__screenshots__" / "T-027"
    )
    out.mkdir(parents=True, exist_ok=True)
    for lang, name in (("en", "official-en.pdf"), ("uk", "official-uk.pdf")):
        pdf = minutes_pdf(_ctx(lang))
        dest = out / name
        dest.write_bytes(pdf)
        print(f"wrote {dest} ({len(pdf)} bytes)")


if __name__ == "__main__":
    main()
