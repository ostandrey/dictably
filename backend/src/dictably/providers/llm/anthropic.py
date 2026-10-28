from __future__ import annotations

from typing import Any

from dictably.domain.minutes_schema import (
    SYSTEM_PROMPT,
    Minutes,
    build_user_message,
    format_transcript_lines,
)


class AnthropicLLMProvider:
    name = "anthropic"

    def __init__(self, api_key: str, *, model: str = "claude-haiku-5-5") -> None:
        if not api_key.strip():
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
        self._api_key = api_key.strip()
        self._model = model

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        language = str(transcript.get("language") or "en")
        segments = [s for s in (transcript.get("segments") or []) if isinstance(s, dict)]
        speakers = [s for s in (transcript.get("speakers") or []) if isinstance(s, dict)]
        parties = [p for p in (transcript.get("parties") or []) if isinstance(p, dict)]
        system = SYSTEM_PROMPT.format(language=language)
        user = build_user_message(
            language,
            format_transcript_lines(segments, speakers=speakers),
            parties=parties,
        )

        parsed = await client.messages.parse(
            model=self._model,
            max_tokens=8192,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=Minutes,
        )
        stop = getattr(parsed, "stop_reason", None)
        if stop == "refusal":
            raise RuntimeError("Anthropic refused to generate minutes (stop_reason=refusal).")
        if parsed.parsed_output is None:
            raise RuntimeError("Anthropic returned no parsed Minutes")
        out = parsed.parsed_output.model_dump()
        out["provider"] = self.name
        out["model"] = self._model
        return out
