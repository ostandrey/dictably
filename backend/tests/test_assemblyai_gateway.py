"""T-016a B1: LLM Gateway chat/completions contract (no network)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from dictably.domain.minutes_schema import Minutes
from dictably.providers.llm.assemblyai_gateway import (
    GATEWAY_HOSTS,
    AssemblyAILLMProvider,
    parse_gateway_json_content,
)
from dictably.providers.llm.pricing import estimate_cost_usd, estimate_from_usage

FIXTURE = Path(__file__).parent / "fixtures" / "assemblyai_gateway_chat_completion.json"


def test_gateway_hosts_eu_and_us() -> None:
    assert GATEWAY_HOSTS["eu"].startswith("https://llm-gateway.eu.assemblyai.com/")
    assert GATEWAY_HOSTS["us"].startswith("https://llm-gateway.assemblyai.com/")
    assert GATEWAY_HOSTS["eu"].endswith("/v1/chat/completions")
    assert GATEWAY_HOSTS["us"].endswith("/v1/chat/completions")


def test_provider_default_region_eu() -> None:
    p = AssemblyAILLMProvider("test-key", model="claude-haiku-5-5")
    assert p._region == "eu"
    assert p._url == GATEWAY_HOSTS["eu"]
    assert p._model == "claude-haiku-5-5"


def test_provider_rejects_bad_region() -> None:
    with pytest.raises(ValueError, match="ASSEMBLYAI_LLM_REGION"):
        AssemblyAILLMProvider("test-key", region="asia")


def test_parse_gateway_fixture_from_docs_shape() -> None:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data = parse_gateway_json_content(payload)
    minutes = Minutes.model_validate(data)
    assert minutes.title == "Gateway fixture"
    assert minutes.agreements[0].quote == "We will ship Friday"
    assert payload["request_id"] == "abc123"
    assert payload["usage"]["input_tokens"] == 85


def test_haiku_pricing_not_inflated() -> None:
    # 1M in + 1M out → $0.60 total, not $6.
    cost = estimate_cost_usd(
        model="claude-haiku-5-5",
        input_tokens=1_000_000,
        output_tokens=1_000_000,
    )
    assert cost == pytest.approx(0.60, abs=1e-6)
    # Fixture usage from docs shape.
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    small = estimate_from_usage("claude-haiku-5-5", payload["usage"])
    assert small is not None
    assert small < 0.01
