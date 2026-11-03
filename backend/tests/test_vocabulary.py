"""T-042/T-046: personal vocabulary learn + merge into uploads."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from dictably.db.models import ProductEvent
from dictably.db.session import get_session_factory
from dictably.domain import account as account_domain
from dictably.domain import analytics as analytics_domain
from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain.media import ProbeResult
from dictably.providers.storage.local import LocalStorageProvider


def test_clean_vocabulary_term_strips_punct_and_limits() -> None:
    assert account_domain.clean_vocabulary_term("Acronis,") == "Acronis"
    assert account_domain.clean_vocabulary_term("  «Акроніс» ") == "Акроніс"
    assert account_domain.clean_vocabulary_term("one two three four five six seven") == (
        "one two three four five six"
    )
    long = "x" * 80
    cleaned = account_domain.clean_vocabulary_term(long)
    assert cleaned is not None
    assert len(cleaned) <= 64
    assert account_domain.clean_vocabulary_term(",,,") is None


async def _login(client: AsyncClient, email: str = "vocab@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Vocab"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
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
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    return store


@pytest.mark.asyncio
async def test_learn_vocabulary_and_upload_merge(
    client: AsyncClient,
    storage: LocalStorageProvider,
) -> None:
    csrf = await _login(client)
    headers = {auth_domain.CSRF_HEADER: csrf}

    learned = await client.post(
        "/api/me/vocabulary",
        json={"term": "Acronis,"},
        headers=headers,
    )
    assert learned.status_code == 200, learned.text
    assert learned.json()["vocabulary"] == ["Acronis"]

    factory = get_session_factory()
    async with factory() as session:
        rows = (
            (
                await session.execute(
                    select(ProductEvent).where(
                        ProductEvent.name == analytics_domain.EVENT_VOCABULARY_LEARNED
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) >= 1
        assert "Acronis" not in str(rows[-1].props)

    patched = await client.patch(
        "/api/me",
        json={"vocabulary": ["Acronis", "Dictably"]},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["vocabulary"] == ["Acronis", "Dictably"]

    removed = await client.patch(
        "/api/me",
        json={"vocabulary": ["Dictably"]},
        headers=headers,
    )
    assert removed.status_code == 200
    assert removed.json()["vocabulary"] == ["Dictably"]

    await client.post("/api/me/vocabulary", json={"term": "Acronis"}, headers=headers)

    up = await client.post(
        "/api/media",
        headers=headers,
        files={"file": ("vocab.wav", b"fake-audio", "audio/wav")},
        data={"vocabulary": "ZoomTerm"},
    )
    assert up.status_code == 201, up.text
    vocab = up.json().get("vocabulary") or []
    assert "Acronis" in vocab
    assert "Dictably" in vocab
    assert "ZoomTerm" in vocab

    many = [f"term{i}" for i in range(200)]
    capped = await client.patch(
        "/api/me",
        json={"vocabulary": many + ["overflow"]},
        headers=headers,
    )
    assert capped.status_code == 200
    assert len(capped.json()["vocabulary"]) == 200
