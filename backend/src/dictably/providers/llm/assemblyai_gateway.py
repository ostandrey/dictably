"""AssemblyAI LLM Gateway as MinutesProvider (T-016a B1).

POST https://llm-gateway[.eu].assemblyai.com/v1/chat/completions
Same API key as ASR. Model id from ASSEMBLYAI_LLM_MODEL (docs Available models).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from pydantic import ValidationError

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

GATEWAY_HOSTS = {
    "eu": "https://llm-gateway.eu.assemblyai.com/v1/chat/completions",
    "us": "https://llm-gateway.assemblyai.com/v1/chat/completions",
}

# Default: Haiku 5.5 — listed in AssemblyAI Available models; EU-capable (Claude).
DEFAULT_MODEL = "claude-haiku-5-5"


class AssemblyAILLMProvider:
    name = "assemblyai_gateway"

    def __init__(
        self,
        api_key: str,
        *,
        model: str | None = None,
        region: str = "eu",
    ) -> None:
        if not api_key.strip():
            raise ValueError("ASSEMBLYAI_API_KEY is required when LLM_PROVIDER=assemblyai_gateway")
        self._api_key = api_key.strip()
        self._model = (model or "").strip() or DEFAULT_MODEL
        region_key = (region or "eu").strip().lower()
        if region_key not in GATEWAY_HOSTS:
            raise ValueError(f"ASSEMBLYAI_LLM_REGION must be 'eu' or 'us', got {region!r}")
        self._region = region_key
        self._url = GATEWAY_HOSTS[region_key]

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
        schema = Minutes.model_json_schema()
        messages = [
            {"role": "system", "content": EXTRACT_SYSTEM.format(language=language)},
            {"role": "user", "content": user_message},
        ]
        data, usage = await self._chat_json(
            messages=messages,
            schema_name="Minutes",
            schema=schema,
            max_tokens=16_384,
        )
        minutes = Minutes.model_validate(data)
        out = minutes.model_dump()
        out["provider"] = self.name
        out["model"] = self._model
        out["prompt_version"] = PROMPT_VERSION
        cost = estimate_from_usage(self._model, usage)
        if cost is not None:
            out["cost_usd"] = cost
        return out

    async def verify(
        self,
        *,
        items: list[dict[str, Any]],
        language: str,
    ) -> dict[str, Any]:
        schema = VerifyBatch.model_json_schema()
        user = (
            f"Meeting language: {language}\n\n"
            "Verify these items against their context:\n"
            f"{json.dumps(items, ensure_ascii=False)}"
        )
        messages = [
            {"role": "system", "content": VERIFY_SYSTEM},
            {"role": "user", "content": user},
        ]
        data, usage = await self._chat_json(
            messages=messages,
            schema_name="VerifyBatch",
            schema=schema,
            max_tokens=8_192,
        )
        out = VerifyBatch.model_validate(data).model_dump()
        cost = estimate_from_usage(self._model, usage)
        if cost is not None:
            out["cost_usd"] = cost
        return out

    async def _chat_json(
        self,
        *,
        messages: list[dict[str, str]],
        schema_name: str,
        schema: dict[str, Any],
        max_tokens: int,
    ) -> tuple[dict[str, Any], Any]:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "schema": schema,
                    "strict": False,
                },
            },
            "post_processing_steps": [{"type": "json-repair"}],
        }
        payload = await self._post(body)
        try:
            return parse_gateway_json_content(payload), payload.get("usage")
        except (json.JSONDecodeError, ValidationError, KeyError, TypeError, ValueError) as exc:
            log.warning("assemblyai_gateway JSON parse failed once: %s", exc)
            # One repair attempt: ask the model to fix JSON (T-016a B1).
            raw = _message_content(payload)
            fix_messages = [
                *messages,
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": (
                        "Your previous reply was not valid JSON for the schema. "
                        "Reply with ONLY a corrected JSON object, no markdown."
                    ),
                },
            ]
            body["messages"] = fix_messages
            payload2 = await self._post(body)
            return parse_gateway_json_content(payload2), payload2.get("usage")

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "authorization": self._api_key,
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(self._url, headers=headers, json=body)
            if res.status_code >= 400:
                log.error(
                    "assemblyai gateway error region=%s status=%s body=%s",
                    self._region,
                    res.status_code,
                    res.text[:400],
                )
                res.raise_for_status()
            payload = res.json()
        request_id = payload.get("request_id")
        if request_id:
            log.info(
                "assemblyai_gateway request_id=%s model=%s region=%s",
                request_id,
                self._model,
                self._region,
            )
        return payload


def _message_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("LLM Gateway response missing choices")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if content is None:
        raise ValueError("LLM Gateway response missing message.content")
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)
    return str(content)


def parse_gateway_json_content(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract JSON object from an OpenAI-shaped chat completion (docs format)."""
    content = _message_content(payload)
    if isinstance(content, dict):
        return content
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Expected JSON object from LLM Gateway")
    return data
