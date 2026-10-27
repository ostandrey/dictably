from __future__ import annotations

from pathlib import Path

from demo_kit.models import Minutes, Transcript


class ValidationError(Exception):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("\n".join(errors))


def load_transcript(path: Path) -> Transcript:
    return Transcript.model_validate_json(path.read_text(encoding="utf-8"))


def load_minutes(path: Path) -> Minutes:
    return Minutes.model_validate_json(path.read_text(encoding="utf-8"))


def validate_minutes(transcript: Transcript, minutes: Minutes) -> Minutes:
    """Drop / reject items with missing or unknown segment_ids; set stamp from first seg."""
    known = {s.id for s in transcript.segments}
    errors: list[str] = []

    def check_ids(label: str, ids: list[str]) -> list[str]:
        if not ids:
            errors.append(f"{label}: empty segment_ids")
            return []
        bad = [i for i in ids if i not in known]
        if bad:
            errors.append(f"{label}: unknown segment_ids {bad}")
            return []
        return ids

    party_ids = {p.id for p in minutes.parties}

    for i, p in enumerate(minutes.summary):
        p.segment_ids = check_ids(f"summary[{i}]", p.segment_ids)
    for i, p in enumerate(minutes.decisions):
        p.segment_ids = check_ids(f"decisions[{i}]", p.segment_ids)
    for i, a in enumerate(minutes.agreements):
        a.segment_ids = check_ids(f"agreements[{i}]", a.segment_ids)
        if a.party_id not in party_ids:
            errors.append(f"agreements[{i}]: unknown party_id {a.party_id!r}")
    for i, t in enumerate(minutes.tasks):
        t.segment_ids = check_ids(f"tasks[{i}]", t.segment_ids)
        if t.party_id not in party_ids:
            errors.append(f"tasks[{i}]: unknown party_id {t.party_id!r}")
    for i, p in enumerate(minutes.deadlines_and_facts):
        p.segment_ids = check_ids(f"deadlines_and_facts[{i}]", p.segment_ids)
    for i, p in enumerate(minutes.open_questions):
        p.segment_ids = check_ids(f"open_questions[{i}]", p.segment_ids)

    # Filter emptied items after check
    minutes.summary = [p for p in minutes.summary if p.segment_ids]
    minutes.decisions = [p for p in minutes.decisions if p.segment_ids]
    minutes.agreements = [a for a in minutes.agreements if a.segment_ids]
    minutes.tasks = [t for t in minutes.tasks if t.segment_ids]
    minutes.deadlines_and_facts = [
        p for p in minutes.deadlines_and_facts if p.segment_ids
    ]
    minutes.open_questions = [p for p in minutes.open_questions if p.segment_ids]

    if errors:
        raise ValidationError(errors)
    return minutes


def point_start_ms(transcript: Transcript, segment_ids: list[str]) -> int:
    by_id = {s.id: s for s in transcript.segments}
    return by_id[segment_ids[0]].start_ms
