"""T-027: minutes templates (default vs official protocol)."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.media import ProbeResult
from dictably.domain.minutes_templates import (
    TEMPLATE_DEFAULT,
    TEMPLATE_OFFICIAL,
    extract_system_for,
    normalize_template,
)
from dictably.providers.storage.local import LocalStorageProvider


def test_normalize_template():
    assert normalize_template(None) == TEMPLATE_DEFAULT
    assert normalize_template("minutes") == TEMPLATE_DEFAULT
    assert normalize_template("official_protocol") == TEMPLATE_OFFICIAL
    assert normalize_template("Official") == TEMPLATE_OFFICIAL


def test_extract_systems_differ():
    d = extract_system_for(TEMPLATE_DEFAULT)
    o = extract_system_for(TEMPLATE_OFFICIAL)
    assert "agenda" in o.lower() or "поряд" in o.lower() or "Heard" in o or "Слухали" in o
    assert d != o


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


async def _login(client: AsyncClient) -> str:
    res = await client.post(
        "/api/auth/dev-login",
        json={"email": f"t027-{uuid4().hex[:8]}@example.com", "name": "Dev"},
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


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    return store


@pytest.mark.asyncio
async def test_regenerate_with_official_template(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client)
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)

    up = await client.post(
        "/api/media",
        files={"file": ("short.wav", b"fake-audio", "audio/wav")},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]
    assert up.json()["status"] == "ready"

    first = await client.get(f"/api/media/{media_id}/analysis")
    assert first.status_code == 200
    assert first.json()["template"] == TEMPLATE_DEFAULT
    assert first.json()["result"].get("summary")

    regen = await client.post(
        f"/api/media/{media_id}/analysis",
        json={"template": "official_protocol"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert regen.status_code == 200, regen.text
    body = regen.json()
    assert body["template"] == TEMPLATE_OFFICIAL
    result = body["result"]
    assert result.get("agenda") or result.get("heard") or result.get("decisions")
    # Official fake fixture prefers agenda/heard over summary
    assert result.get("agenda")
    assert result.get("heard")
    assert result.get("decisions")
    assert result["heard"][0].get("agenda_ref")
    assert result["decisions"][0].get("agenda_ref")

    md = await client.get(
        f"/api/media/{media_id}/export",
        params={"kind": "minutes", "format": "md"},
    )
    assert md.status_code == 200
    text = md.content.decode("utf-8")
    assert "Agenda" in text or "Порядок" in text or "Fake agenda" in text
    assert "Discussion" in text or "Слухали" in text
    assert "Decision" in text or "Вирішили" in text
    # Signatures are DOCX/PDF only
    assert "Prepared by" not in text and "Склав" not in text


@pytest.mark.asyncio
async def test_upload_with_official_template_first_pass(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B2: template at upload → first analysis uses it (no second LLM required)."""
    csrf = await _login(client)
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)

    up = await client.post(
        "/api/media",
        files={"file": ("short.wav", b"fake-audio", "audio/wav")},
        data={"minutes_template": "official_protocol"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert up.status_code == 201, up.text
    assert up.json()["minutes_template"] == TEMPLATE_OFFICIAL
    media_id = up.json()["id"]

    analysis = await client.get(f"/api/media/{media_id}/analysis")
    assert analysis.status_code == 200
    assert analysis.json()["template"] == TEMPLATE_OFFICIAL
    assert analysis.json()["result"].get("agenda")

    me = await client.get("/api/me")
    assert me.json()["preferred_minutes_template"] == TEMPLATE_OFFICIAL
    _ = storage


def test_template_from_use_cases() -> None:
    from dictably.domain.minutes_templates import template_from_use_cases

    assert template_from_use_cases(["internal"]) == TEMPLATE_OFFICIAL
    assert template_from_use_cases(["client_meetings", "internal"]) == TEMPLATE_OFFICIAL
    assert template_from_use_cases(["client_meetings"]) == TEMPLATE_DEFAULT
    assert template_from_use_cases([]) == TEMPLATE_DEFAULT


def test_group_by_agenda() -> None:
    from dictably.domain.minutes_schema import Minutes, Point, Task
    from dictably.domain.minutes_templates import group_by_agenda

    minutes = Minutes(
        template=TEMPLATE_OFFICIAL,
        agenda=[
            Point(text="Topic one", item_id="A1", segment_ids=["S1"], quote="Topic one"),
            Point(text="Topic two", item_id="A2", segment_ids=["S1"], quote="Topic two"),
        ],
        heard=[
            Point(
                text="Heard A1",
                item_id="H1",
                agenda_ref="A1",
                segment_ids=["S1"],
                quote="Heard A1",
            ),
        ],
        decisions=[
            Point(
                text="Decide A2",
                item_id="D1",
                agenda_ref="A2",
                segment_ids=["S1"],
                quote="Decide A2",
            ),
        ],
        tasks=[
            Task(
                party_id="our",
                text="Loose task",
                agenda_ref=None,
                segment_ids=["S1"],
                quote="Loose task",
            ),
        ],
    )
    buckets = group_by_agenda(minutes)
    assert len(buckets) == 3  # A1, A2, Other
    assert buckets[0].heard[0].text == "Heard A1"
    assert buckets[1].decisions[0].text == "Decide A2"
    assert buckets[2].agenda is None
    assert buckets[2].tasks[0].text == "Loose task"
