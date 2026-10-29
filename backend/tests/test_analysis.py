"""T-016: minutes validation + analysis API ownership / regenerate limit."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.media import ProbeResult
from dictably.domain.minutes_schema import validate_minutes
from dictably.providers.llm.fake import FakeLLMProvider
from dictably.providers.storage.local import LocalStorageProvider


def test_get_llm_provider_anthropic_empty_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B1: missing key → config error, not ImportError."""
    from dictably.core.config import Settings
    from dictably.providers.factory import get_llm_provider

    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    settings = Settings(_env_file=None)
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY") as ei:
        get_llm_provider(settings)
    assert not isinstance(ei.value, ImportError)


def test_prompt_includes_speaker_names_and_transcript_tags() -> None:
    """S1 + S3: display names/parties in lines; wrapped in <transcript>."""
    from dictably.domain.minutes_schema import (
        SYSTEM_PROMPT,
        build_user_message,
        format_transcript_lines,
    )

    lines = format_transcript_lines(
        [{"id": "S12", "start_ms": 195_000, "text": "We will send it.", "speaker_id": "A"}],
        speakers=[
            {
                "id": "uuid-a",
                "label": "A",
                "display_name": "Olena",
                "party": "our",
            }
        ],
    )
    assert "[S12 03:15 Olena (our)] We will send it." in lines
    msg = build_user_message(
        "en",
        lines,
        parties=[{"id": "our", "label": "Support team"}],
    )
    assert "<transcript>" in msg and "</transcript>" in msg
    assert "Assigned parties" in msg
    assert "Support team" in msg
    assert "<transcript>" in SYSTEM_PROMPT or "untrusted" in SYSTEM_PROMPT.lower()


def test_regen_human_error_constant() -> None:
    """S2: user-facing regenerate failure text."""
    from dictably.domain.analysis import REGEN_HUMAN_ERROR

    assert "Couldn't update the minutes" in REGEN_HUMAN_ERROR
    assert "Try again" in REGEN_HUMAN_ERROR


def test_validate_minutes_drops_unknown_segment_ids() -> None:
    segments = [
        {"id": "S1", "start_ms": 0, "end_ms": 1000, "text": "one"},
        {"id": "S2", "start_ms": 1000, "end_ms": 2000, "text": "two"},
    ]
    raw = {
        "language": "en",
        "title": "T",
        "parties": [{"id": "our", "label": "Our"}],
        "participants": [],
        "summary": [
            {"text": "ok", "segment_ids": ["S1"], "quote": "one"},
            {"text": "bad", "segment_ids": ["S_MISSING"], "quote": "one"},
            {"text": "empty", "segment_ids": [], "quote": "one"},
        ],
        "agreements": [
            {"party_id": "our", "text": "ok agree", "segment_ids": ["S2"], "quote": "two"},
            {"party_id": "ghost", "text": "bad party", "segment_ids": ["S1"], "quote": "one"},
        ],
        "tasks": [],
        "decisions": [],
        "deadlines_and_facts": [],
        "open_questions": [],
    }
    cleaned, dropped = validate_minutes(segments, raw, require_quote=True)
    assert len(cleaned.summary) == 1
    assert cleaned.summary[0].text == "ok"
    assert len(cleaned.agreements) == 1
    assert cleaned.agreements[0].text == "ok agree"
    assert any("S_MISSING" in d for d in dropped)
    assert any("empty segment_ids" in d for d in dropped)
    assert any("unknown party_id" in d for d in dropped)


@pytest.mark.asyncio
async def test_fake_llm_segment_ids_survive_validation() -> None:
    llm = FakeLLMProvider()
    transcript = {
        "language": "en",
        "segments": [
            {"id": "S1", "start_ms": 0, "end_ms": 1000, "text": "a"},
            {"id": "S2", "start_ms": 1000, "end_ms": 2000, "text": "b"},
        ],
    }
    raw = await llm.analyze(transcript=transcript)
    cleaned, dropped = validate_minutes(transcript["segments"], raw)
    assert cleaned.agreements
    assert cleaned.agreements[0].segment_ids
    assert not any("unknown segment_ids" in d for d in dropped)


async def _login(client: AsyncClient, email: str = "dev@example.com") -> str:
    res = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Dev"},
    )
    assert res.status_code == 200, res.text
    csrf = res.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text
    return csrf


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    return store


async def _upload_ready(client: AsyncClient, csrf: str, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)
    res = await client.post(
        "/api/media",
        files={"file": ("short.wav", b"fake-audio-bytes", "audio/wav")},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "ready"
    return body["id"]


@pytest.mark.asyncio
async def test_analysis_happy_path_and_regenerate_limit(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client)
    media_id = await _upload_ready(client, csrf, monkeypatch)

    got = await client.get(f"/api/media/{media_id}/analysis")
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["result"]["agreements"]
    assert body["result"]["agreements"][0]["segment_ids"]
    assert body["result"]["agreements"][0].get("start_ms") is not None
    left = body["regenerations_left"]
    assert left == 4

    for _ in range(left):
        regen = await client.post(
            f"/api/media/{media_id}/analysis",
            headers={auth_domain.CSRF_HEADER: csrf},
        )
        assert regen.status_code == 200, regen.text

    blocked = await client.post(
        f"/api/media/{media_id}/analysis",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_analysis_other_user_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client, "owner@example.com")
    media_id = await _upload_ready(client, csrf, monkeypatch)

    other = await _login(client, "intruder@example.com")
    res = await client.get(f"/api/media/{media_id}/analysis")
    assert res.status_code == 404
    # csrf cookie from second login still present; ownership check is what matters
    _ = other


@pytest.mark.asyncio
async def test_analysis_missing_media_404(client: AsyncClient) -> None:
    await _login(client)
    r = await client.get(f"/api/media/{uuid4()}/analysis")
    assert r.status_code == 404
