from __future__ import annotations

import json
import shutil
from pathlib import Path

from demo_kit.models import Minutes, Transcript
from demo_kit.paths import ensure_out, fixture_dir
from demo_kit.prompts import SYSTEM_PROMPT, build_user_message, format_transcript_lines
from demo_kit.validate import load_transcript, validate_minutes


def run_minutes(
    slug: str,
    *,
    mode: str = "manual",
    fixture_name: str = "sample",
) -> Path:
    """Produce out/<slug>/minutes.json and/or minutes_request.md. Returns minutes path when ready."""
    out = ensure_out(slug)
    transcript_path = out / "transcript.json"
    if not transcript_path.is_file():
        raise FileNotFoundError(f"Missing {transcript_path} — run transcribe first")

    transcript = load_transcript(transcript_path)
    minutes_path = out / "minutes.json"

    if mode == "fixture":
        src = fixture_dir(fixture_name) / "minutes.json"
        if not src.is_file():
            raise FileNotFoundError(f"Missing fixture minutes: {src}")
        shutil.copy2(src, minutes_path)
        minutes = Minutes.model_validate_json(minutes_path.read_text(encoding="utf-8"))
        minutes = validate_minutes(transcript, minutes)
        minutes_path.write_text(minutes.model_dump_json(indent=2), encoding="utf-8")
        return minutes_path

    if mode == "manual":
        req = out / "minutes_request.md"
        req.write_text(
            _manual_request_markdown(transcript),
            encoding="utf-8",
        )
        if minutes_path.is_file():
            minutes = Minutes.model_validate_json(
                minutes_path.read_text(encoding="utf-8")
            )
            minutes = validate_minutes(transcript, minutes)
            minutes_path.write_text(
                minutes.model_dump_json(indent=2),
                encoding="utf-8",
            )
            return minutes_path
        return req

    if mode == "anthropic":
        from demo_kit.minutes.anthropic_provider import generate_minutes

        minutes = generate_minutes(transcript)
        minutes = validate_minutes(transcript, minutes)
        minutes_path.write_text(minutes.model_dump_json(indent=2), encoding="utf-8")
        return minutes_path

    raise ValueError(f"Unknown minutes mode: {mode!r}")


def _manual_request_markdown(transcript: Transcript) -> str:
    lines = format_transcript_lines(transcript.segments)
    system = SYSTEM_PROMPT.format(language=transcript.language)
    user = build_user_message(transcript.language, lines)
    schema_hint = json.dumps(
        Minutes.model_json_schema(),
        ensure_ascii=False,
        indent=2,
    )
    return (
        "# Minutes request (manual mode)\n\n"
        "Claude (in Claude Code): read this file, produce `minutes.json` in the **same folder** "
        "matching the schema. Then run `uv run demo validate <slug>` and `uv run demo render <slug>`.\n\n"
        "## System prompt\n\n"
        f"```\n{system}\n```\n\n"
        "## User message\n\n"
        f"```\n{user}\n```\n\n"
        "## Minutes JSON schema\n\n"
        f"```json\n{schema_hint}\n```\n"
    )
