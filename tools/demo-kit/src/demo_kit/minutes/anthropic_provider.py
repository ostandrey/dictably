from __future__ import annotations

import os

from demo_kit.models import Minutes, Transcript
from demo_kit.prompts import SYSTEM_PROMPT, build_user_message, format_transcript_lines


def generate_minutes(transcript: Transcript) -> Minutes:
    try:
        import anthropic
    except ImportError as e:
        raise RuntimeError("anthropic SDK not installed. Run: uv sync --extra anthropic") from e

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY missing. Use --mode manual or fixture for T-000.")

    client = anthropic.Anthropic(api_key=api_key)
    system = SYSTEM_PROMPT.format(language=transcript.language)
    user = build_user_message(
        transcript.language,
        format_transcript_lines(transcript.segments),
    )
    # S3: DEMO-KIT default model
    model = os.environ.get("DEMO_KIT_ANTHROPIC_MODEL", "claude-sonnet-5-5")

    parsed = client.messages.parse(
        model=model,
        max_tokens=8192,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=Minutes,
    )
    stop = getattr(parsed, "stop_reason", None)
    if stop == "refusal":
        raise RuntimeError(
            "Anthropic refused to generate minutes (stop_reason=refusal). "
            "Check the transcript for policy triggers or try --mode manual."
        )
    if parsed.parsed_output is None:
        raise RuntimeError("Anthropic returned no parsed Minutes")
    return parsed.parsed_output
