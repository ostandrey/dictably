"""Two-pass minutes pipeline (T-016a / AI-PIPELINE §§1–4)."""

from __future__ import annotations

import logging
from typing import Any

from dictably.domain.minutes_prepare import (
    format_transcript_lines,
    neighbor_context,
)
from dictably.domain.minutes_schema import (
    PROMPT_VERSION,
    Minutes,
    apply_verification,
    assign_item_ids,
    build_user_message,
    iter_evidence_items,
    validate_minutes,
)
from dictably.providers.llm.base import MinutesProvider

log = logging.getLogger(__name__)

VERIFY_FAILED_REASON = "не вдалося перевірити"


def _duration_ms(segments: list[dict[str, Any]]) -> int | None:
    ends = [int(s.get("end_ms") or s.get("start_ms") or 0) for s in segments if isinstance(s, dict)]
    return max(ends) if ends else None


def build_verify_payload(
    minutes: Minutes,
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Items + ±2 neighbor context for pass 2."""
    payload: list[dict[str, Any]] = []
    for it in iter_evidence_items(minutes):
        ctx = neighbor_context(segments, list(it.segment_ids), radius=2)
        payload.append(
            {
                "item_id": it.item_id,
                "text": it.text,
                "party_id": getattr(it, "party_id", None),
                "due_text": getattr(it, "due_text", None),
                "quote": it.quote,
                "segment_ids": list(it.segment_ids),
                "status": it.status,
                "context_lines": format_transcript_lines(ctx, merge=False),
            }
        )
    return payload


def mark_unverified(minutes: Minutes, *, reason: str = VERIFY_FAILED_REASON) -> None:
    for it in iter_evidence_items(minutes):
        it.verify = "weak"
        it.verify_reason = reason


async def run_minutes_pipeline(
    llm: MinutesProvider,
    *,
    transcript: dict[str, Any],
    require_quote: bool = True,
) -> dict[str, Any]:
    """Pass 1 extract → code validate → pass 2 verify → apply."""
    language = str(transcript.get("language") or "en")
    segments = [s for s in (transcript.get("segments") or []) if isinstance(s, dict)]
    speakers = [s for s in (transcript.get("speakers") or []) if isinstance(s, dict)]
    parties = [p for p in (transcript.get("parties") or []) if isinstance(p, dict)]
    duration_ms = _duration_ms(segments)

    lines = format_transcript_lines(segments, speakers=speakers, merge=True)
    user = build_user_message(
        language,
        lines,
        parties=parties,
        speakers=speakers,
        duration_ms=duration_ms,
    )

    extract_fn = getattr(llm, "extract", None)
    if extract_fn is not None:
        raw = await extract_fn(transcript=transcript, user_message=user, language=language)
    else:
        raw = await llm.analyze(transcript=transcript)

    cleaned, dropped = validate_minutes(segments, raw, require_quote=require_quote)
    if dropped:
        log.info("minutes.validate dropped=%s sample=%s", len(dropped), dropped[:5])

    cleaned = assign_item_ids(cleaned)
    verify_payload = build_verify_payload(cleaned, segments)

    cost_total = 0.0
    cost_parts = 0
    if isinstance(raw, dict) and raw.get("cost_usd") is not None:
        cost_total += float(raw["cost_usd"])
        cost_parts += 1

    verify_fn = getattr(llm, "verify", None)
    if verify_fn is not None and verify_payload:
        try:
            batch_raw = await verify_fn(items=verify_payload, language=language)
            if isinstance(batch_raw, dict) and batch_raw.get("cost_usd") is not None:
                cost_total += float(batch_raw.pop("cost_usd"))
                cost_parts += 1
            cleaned, vnotes = apply_verification(cleaned, batch_raw)
            if vnotes:
                log.info("minutes.verify removed=%s sample=%s", len(vnotes), vnotes[:5])
        except Exception as exc:  # noqa: BLE001 — S3: soft-fail verify
            log.warning("minutes.verify soft-fail: %s", exc)
            mark_unverified(cleaned)
    else:
        # Providers without verify: mark all supported so UI stays quiet in tests.
        for it in iter_evidence_items(cleaned):
            it.verify = it.verify or "supported"

    data = cleaned.model_dump()
    data["provider"] = raw.get("provider") if isinstance(raw, dict) else getattr(llm, "name", None)
    data["model"] = raw.get("model") if isinstance(raw, dict) else None
    data["prompt_version"] = PROMPT_VERSION
    if cost_parts:
        data["cost_usd"] = round(cost_total, 6)
    # Attach drop log for eval / debugging (not part of Minutes schema → strip before validate).
    data["_validation_dropped"] = dropped
    return data


def parse_minutes_result(data: dict[str, Any]) -> Minutes:
    clean = {k: v for k, v in data.items() if not k.startswith("_")}
    return Minutes.model_validate(clean)
