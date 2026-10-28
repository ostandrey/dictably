"""T-015: speaker rename + audio ownership."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.media import ProbeResult
from dictably.providers.storage.local import LocalStorageProvider


async def _login(client: AsyncClient, email: str = "dev@example.com") -> str:
    res = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Dev"},
    )
    assert res.status_code == 200, res.text
    return res.cookies[auth_domain.CSRF_COOKIE]


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
    assert body.get("speaker_count", 0) >= 1
    return body["id"]


@pytest.mark.asyncio
async def test_rename_speaker_and_party(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client)
    media_id = await _upload_ready(client, csrf, monkeypatch)
    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200
    speakers = tr.json()["speakers"]
    assert len(speakers) >= 2
    sid = speakers[0]["id"]

    patched = await client.patch(
        f"/api/media/{media_id}/speakers/{sid}",
        json={"display_name": "Olena", "party": "their"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert patched.status_code == 200, patched.text
    data = patched.json()
    assert data["display_name"] == "Olena"
    assert data["party"] == "their"

    listed = await client.get(f"/api/media/{media_id}/speakers")
    assert listed.status_code == 200
    match = next(s for s in listed.json() if s["id"] == sid)
    assert match["display_name"] == "Olena"
    assert match["party"] == "their"


@pytest.mark.asyncio
async def test_speaker_patch_foreign_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_a = await _login(client, "owner-a@example.com")
    media_id = await _upload_ready(client, csrf_a, monkeypatch)
    tr = await client.get(f"/api/media/{media_id}/transcript")
    sid = tr.json()["speakers"][0]["id"]

    await client.post("/api/auth/logout", headers={auth_domain.CSRF_HEADER: csrf_a})
    csrf_b = await _login(client, "owner-b@example.com")
    res = await client.patch(
        f"/api/media/{media_id}/speakers/{sid}",
        json={"display_name": "Hacker"},
        headers={auth_domain.CSRF_HEADER: csrf_b},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_audio_owner_ok_foreign_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_a = await _login(client, "audio-a@example.com")
    media_id = await _upload_ready(client, csrf_a, monkeypatch)
    ok = await client.get(f"/api/media/{media_id}/audio")
    assert ok.status_code == 200
    assert "audio" in (ok.headers.get("content-type") or "")

    await client.post("/api/auth/logout", headers={auth_domain.CSRF_HEADER: csrf_a})
    await _login(client, "audio-b@example.com")
    denied = await client.get(f"/api/media/{media_id}/audio")
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_me_includes_balance(client: AsyncClient) -> None:
    await _login(client)
    me = await client.get("/api/me")
    assert me.status_code == 200
    assert "balance_seconds" in me.json()
    assert isinstance(me.json()["balance_seconds"], int)
