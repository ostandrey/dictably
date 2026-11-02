"""T-041 B1/S3: user title survives regenerate; generic LLM titles skipped."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.media import ProbeResult
from dictably.providers.storage.local import LocalStorageProvider


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


async def _login(client: AsyncClient, email: str) -> str:
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
    return res.json()["id"]


@pytest.mark.asyncio
async def test_user_title_survives_regenerate(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client, "t041-title-user@example.com")
    media_id = await _upload_ready(client, csrf, monkeypatch)

    patched = await client.patch(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"title": "Мій бюджет Q4"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["title"] == "Мій бюджет Q4"

    regen = await client.post(
        f"/api/media/{media_id}/analysis",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert regen.status_code == 200, regen.text

    got = await client.get(f"/api/media/{media_id}")
    assert got.status_code == 200
    assert got.json()["title"] == "Мій бюджет Q4"


@pytest.mark.asyncio
async def test_clear_title_allows_llm_again(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client, "t041-title-clear@example.com")
    media_id = await _upload_ready(client, csrf, monkeypatch)

    await client.patch(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"title": "Keep me"},
    )
    cleared = await client.patch(
        f"/api/media/{media_id}",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"title": ""},
    )
    assert cleared.status_code == 200
    assert cleared.json()["title"] is None

    regen = await client.post(
        f"/api/media/{media_id}/analysis",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert regen.status_code == 200, regen.text
    got = await client.get(f"/api/media/{media_id}")
    # Fake LLM returns a realistic title (T-043 N8).
    assert got.json()["title"] == "Weekly sync with Acme"


def test_apply_llm_title_skips_generic() -> None:
    from types import SimpleNamespace

    from dictably.domain.analysis import _apply_llm_title

    m = SimpleNamespace(title=None, title_source="llm")
    _apply_llm_title(m, "Minutes")  # type: ignore[arg-type]
    assert m.title is None
    _apply_llm_title(m, "Meeting minutes")  # type: ignore[arg-type]
    assert m.title is None
    _apply_llm_title(m, "Budget review with Acme")  # type: ignore[arg-type]
    assert m.title == "Budget review with Acme"
    assert m.title_source == "llm"
    m.title_source = "user"
    m.title = "User set"
    _apply_llm_title(m, "Other title from LLM")  # type: ignore[arg-type]
    assert m.title == "User set"
