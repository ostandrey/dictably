"""Generate minutes-uk.pdf / minutes-en.pdf for T-017 review screenshots.

Run inside the API image (WeasyPrint + fonts):
  docker compose run --rm -v ... api python /app/scripts/gen_export_samples.py
Or after `uv sync` on Linux with Pango:
  uv run python scripts/gen_export_samples.py [outdir]
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from dictably.domain.export import ExportCtx, _labels_for, minutes_pdf
from dictably.domain.minutes_schema import Minutes

MEDIA_ID = UUID("11111111-1111-1111-1111-111111111111")


def _minutes() -> Minutes:
    return Minutes.model_validate(
        {
            "language": "uk",
            "title": "Kickoff — Żółć / Нарада",
            "parties": [
                {"id": "our", "label": "Support team"},
                {"id": "their", "label": "Client"},
            ],
            "participants": [],
            "summary": [
                {
                    "text": "Обговорили запуск і polskie litery у протоколі.",
                    "segment_ids": ["S1"],
                    "start_ms": 90_000,
                }
            ],
            "decisions": [
                {
                    "text": "Затвердити дату релізу.",
                    "segment_ids": ["S2"],
                    "start_ms": 180_000,
                }
            ],
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Надіслати протокол після дзвінка.",
                    "segment_ids": ["S1"],
                    "start_ms": 95_000,
                    "owner_speaker": "A",
                }
            ],
            "tasks": [
                {
                    "party_id": "their",
                    "text": "Підтвердити доступ до стенду.",
                    "segment_ids": ["S3"],
                    "owner_speaker": "B",
                    "due_text": "п'ятниця",
                    "start_ms": 240_000,
                }
            ],
            "deadlines_and_facts": [
                {
                    "text": "Бюджет — до кінця жовтня.",
                    "segment_ids": ["S2"],
                    "start_ms": 200_000,
                }
            ],
            "open_questions": [
                {
                    "text": "Чи потрібен окремий Zoom для онбордингу?",
                    "segment_ids": ["S3"],
                    "start_ms": 300_000,
                }
            ],
        }
    )


def _ctx(locale: str) -> ExportCtx:
    media = SimpleNamespace(
        id=MEDIA_ID,
        filename="kickoff-żółć.m4a",
        created_at=datetime(2026, 10, 14, 10, 30, tzinfo=UTC),
        duration_ms=42 * 60 * 1000,
    )
    speakers = [
        SimpleNamespace(label="A", display_name="Olena", party="our"),
        SimpleNamespace(label="B", display_name="Piotr", party="their"),
    ]
    prefix = "/uk" if locale == "uk" else ""
    return ExportCtx(
        media=media,  # type: ignore[arg-type]
        speakers=speakers,  # type: ignore[arg-type]
        minutes=_minutes(),
        locale=locale,
        labels=_labels_for(locale),
        base_url="https://dictably.example",
        recording_path=f"{prefix}/app/r/?id={MEDIA_ID}",
    )


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    for locale, name in (("uk", "minutes-uk.pdf"), ("en", "minutes-en.pdf")):
        pdf = minutes_pdf(_ctx(locale))
        dest = out / name
        dest.write_bytes(pdf)
        print(f"wrote {dest} ({len(pdf)} bytes)")


if __name__ == "__main__":
    main()
