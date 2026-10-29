"""Per-model USD / 1M token rates (T-016a S1)."""

from __future__ import annotations

from typing import Any

# Anthropic Claude Haiku 5.5 list prices (input / output / cache read / cache write).
# Source: review T-016a + AssemblyAI available-models pricing for claude-haiku-5-5.
MODEL_PRICES_USD_PER_MTOK: dict[str, dict[str, float]] = {
    "claude-haiku-5-5": {
        "input": 0.10,
        "output": 0.50,
        "cache_read": 0.01,
        "cache_write": 0.125,
    },
}

DEFAULT_PRICES = MODEL_PRICES_USD_PER_MTOK["claude-haiku-5-5"]


def prices_for(model: str | None) -> dict[str, float]:
    if not model:
        return DEFAULT_PRICES
    key = model.strip().lower()
    if key in MODEL_PRICES_USD_PER_MTOK:
        return MODEL_PRICES_USD_PER_MTOK[key]
    # Prefix match (e.g. dated ids).
    for name, prices in MODEL_PRICES_USD_PER_MTOK.items():
        if key.startswith(name) or name in key:
            return prices
    return DEFAULT_PRICES


def estimate_cost_usd(
    *,
    model: str | None,
    input_tokens: float = 0,
    output_tokens: float = 0,
    cache_read_tokens: float = 0,
    cache_write_tokens: float = 0,
) -> float:
    p = prices_for(model)
    return round(
        (
            input_tokens * p["input"]
            + output_tokens * p["output"]
            + cache_read_tokens * p.get("cache_read", p["input"] * 0.1)
            + cache_write_tokens * p.get("cache_write", p["input"] * 1.25)
        )
        / 1_000_000,
        6,
    )


def estimate_from_usage(model: str | None, usage: Any) -> float | None:
    if usage is None:
        return None
    # Anthropic SDK attrs or OpenAI-style dict/object from LLM Gateway.
    if isinstance(usage, dict):
        inn = float(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
        out = float(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
        cache_read = float(usage.get("cache_read_input_tokens") or 0)
        cache_write = float(usage.get("cache_creation_input_tokens") or 0)
    else:
        inn = float(getattr(usage, "input_tokens", 0) or getattr(usage, "prompt_tokens", 0) or 0)
        out = float(
            getattr(usage, "output_tokens", 0) or getattr(usage, "completion_tokens", 0) or 0
        )
        cache_read = float(getattr(usage, "cache_read_input_tokens", 0) or 0)
        cache_write = float(getattr(usage, "cache_creation_input_tokens", 0) or 0)
    return estimate_cost_usd(
        model=model,
        input_tokens=inn,
        output_tokens=out,
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
    )
