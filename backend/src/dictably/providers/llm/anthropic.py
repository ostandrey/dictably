from __future__ import annotations

import json
import logging
from typing import Any

from dictably.domain.minutes_schema import (
    EXTRACT_SYSTEM,
    PROMPT_VERSION,
    VERIFY_SYSTEM,
    Minutes,
    VerifyBatch,
    build_user_message,
    format_transcript_lines,
)
from dictably.providers.llm.pricing import estimate_from_usage

log = logging.getLogger(__name__)

EXTRACT_MAX_TOKENS = 16_384
EXTRACT_RETRY_MAX_TOKENS = 32_768
VERIFY_MAX_TOKENS = 8_192


class AnthropicLLMProvider:
    name = "anthropic"

    def __init__(self, api_key: str, *, model: str = "claude-haiku-5-5") -> None:
        if not api_key.strip():
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
        self._api_key = api_key.strip()
        self._model = model

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        language = str(transcript.get("language") or "en")
        segments = [s for s in (transcript.get("segments") or []) if isinstance(s, dict)]
        speakers = [s for s in (transcript.get("speakers") or []) if isinstance(s, dict)]
        parties = [p for p in (transcript.get("parties") or []) if isinstance(p, dict)]
        user = build_user_message(
            language,
            format_transcript_lines(segments, speakers=speakers),
            parties=parties,
            speakers=speakers,
        )
        return await self.extract(transcript=transcript, user_message=user, language=language)

    async def extract(
        self,
        *,
        transcript: dict[str, Any],
        user_message: str,
        language: str,
    ) -> dict[str, Any]:
        del transcript
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        system = [
            {
                "type": "text",
                "text": EXTRACT_SYSTEM.format(language=language),
                "cache_control": {"type": "ephemeral"},
            }
        ]
        parsed, usage_cost = await self._parse_minutes(
            client,
            system=system,
            user=user_message,
            max_tokens=EXTRACT_MAX_TOKENS,
            effort="medium",
        )
        stop = getattr(parsed, "stop_reason", None)
        if stop == "max_tokens":
            log.warning("anthropic.extract truncated; retrying with higher max_tokens")
            parsed, usage_cost = await self._parse_minutes(
                client,
                system=system,
                user=user_message,
                max_tokens=EXTRACT_RETRY_MAX_TOKENS,
                effort="medium",
            )
            stop = getattr(parsed, "stop_reason", None)
        if stop == "refusal":
            raise RuntimeError("Anthropic refused to generate minutes (stop_reason=refusal).")
        if stop == "max_tokens":
            raise RuntimeError("Anthropic minutes response truncated (stop_reason=max_tokens).")
        if parsed.parsed_output is None:
            raise RuntimeError("Anthropic returned no parsed Minutes")
        out = parsed.parsed_output.model_dump()
        out["provider"] = self.name
        out["model"] = self._model
        out["prompt_version"] = PROMPT_VERSION
        if usage_cost is not None:
            out["cost_usd"] = usage_cost
        return out

    async def verify(
        self,
        *,
        items: list[dict[str, Any]],
        language: str,
    ) -> dict[str, Any]:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        system = [
            {
                "type": "text",
                "text": VERIFY_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }
        ]
        user = (
            f"Meeting language: {language}\n\n"
            "Verify these items against their context:\n"
            f"{json.dumps(items, ensure_ascii=False)}\n"
        )
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": VERIFY_MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_format": VerifyBatch,
            "output_config": {"effort": "low"},
        }
        parsed = await client.messages.parse(**kwargs)
        stop = getattr(parsed, "stop_reason", None)
        if stop == "refusal":
            raise RuntimeError("Anthropic refused verify (stop_reason=refusal).")
        if stop == "max_tokens":
            raise RuntimeError("Anthropic verify response truncated (stop_reason=max_tokens).")
        if parsed.parsed_output is None:
            raise RuntimeError("Anthropic returned no VerifyBatch")
        out = parsed.parsed_output.model_dump()
        cost = estimate_from_usage(self._model, getattr(parsed, "usage", None))
        if cost is not None:
            out["cost_usd"] = cost
        return out

    async def _parse_minutes(
        self,
        client: Any,
        *,
        system: list[dict[str, Any]],
        user: str,
        max_tokens: int,
        effort: str,
    ) -> tuple[Any, float | None]:
        parsed = await client.messages.parse(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=Minutes,
            output_config={"effort": effort},
        )
        cost = estimate_from_usage(self._model, getattr(parsed, "usage", None))
        return parsed, cost
