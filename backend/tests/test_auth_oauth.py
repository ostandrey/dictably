from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from dictably.core.config import Settings, get_settings
from dictably.db.models import User
from dictably.db.session import reset_engine
from dictably.domain import auth as auth_domain
from dictably.domain.google_oauth import (
    OAuthPending,
    pack_oauth_cookie,
    sanitize_next_path,
)


def _pending_cookie(*, next_path: str = "/app/", state: str = "state-abc") -> str:
    return pack_oauth_cookie(
        OAuthPending(state=state, code_verifier="verifier-xyz", next_path=next_path)
    )


async def _user_count(session: AsyncSession) -> int:
    return int((await session.execute(select(func.count()).select_from(User))).scalar_one())


@pytest.mark.asyncio
async def test_sanitize_next_rejects_open_redirect() -> None:
    assert sanitize_next_path("/uk/app/") == "/uk/app/"
    assert sanitize_next_path("https://evil.example/") == "/app/"
    assert sanitize_next_path("/admin/") == "/app/"


@pytest.mark.asyncio
async def test_client_ip_ignores_spoofed_xff_when_hops_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fastapi import Request

    from dictably.api.deps import client_ip

    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "0")
    get_settings.cache_clear()
    settings = Settings(_env_file=None)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(b"x-forwarded-for", b"1.2.3.4, 9.9.9.9")],
        "client": ("10.0.0.8", 12345),
        "server": ("test", 80),
    }
    request = Request(scope)
    assert client_ip(request, settings) == "10.0.0.8"


@pytest.mark.asyncio
async def test_client_ip_uses_rightmost_trusted_hop(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import Request

    from dictably.api.deps import client_ip

    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    get_settings.cache_clear()
    settings = Settings(_env_file=None)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(b"x-forwarded-for", b"evil.client, 203.0.113.9")],
        "client": ("10.0.0.8", 12345),
        "server": ("test", 80),
    }
    request = Request(scope)
    assert client_ip(request, settings) == "203.0.113.9"
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_google_callback_invalid_state(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    get_settings.cache_clear()

    client.cookies.set(auth_domain.OAUTH_STATE_COOKIE, _pending_cookie(state="cookie-state"))
    res = await client.get(
        "/api/auth/google/callback",
        params={"code": "x", "state": "other-state"},
        follow_redirects=False,
    )
    assert res.status_code == 302
    assert "auth_error=invalid_state" in res.headers["location"]
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_google_callback_unverified_email(
    client: AsyncClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    get_settings.cache_clear()

    async def _fake_exchange(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {
            "sub": "google-sub-1",
            "email": "victim@example.com",
            "email_verified": False,
            "name": "Attacker",
        }

    monkeypatch.setattr(
        "dictably.api.auth.google_oauth.exchange_code_for_id_token",
        AsyncMock(side_effect=_fake_exchange),
    )

    client.cookies.set(auth_domain.OAUTH_STATE_COOKIE, _pending_cookie())
    res = await client.get(
        "/api/auth/google/callback",
        params={"code": "x", "state": "state-abc"},
        follow_redirects=False,
    )
    assert res.status_code == 302
    assert "auth_error=email_unverified" in res.headers["location"]

    engine = create_async_engine(settings.test_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        assert await _user_count(session) == 0
    await engine.dispose()
    await reset_engine()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_google_callback_same_sub_reuses_user(
    client: AsyncClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    get_settings.cache_clear()

    claims = {
        "sub": "google-sub-stable",
        "email": "same@example.com",
        "email_verified": True,
        "name": "Same",
    }
    monkeypatch.setattr(
        "dictably.api.auth.google_oauth.exchange_code_for_id_token",
        AsyncMock(return_value=claims),
    )

    client.cookies.set(auth_domain.OAUTH_STATE_COOKIE, _pending_cookie())
    first = await client.get(
        "/api/auth/google/callback",
        params={"code": "a", "state": "state-abc"},
        follow_redirects=False,
    )
    assert first.status_code == 302
    assert "auth_error=" not in first.headers["location"]

    client.cookies.set(auth_domain.OAUTH_STATE_COOKIE, _pending_cookie())
    second = await client.get(
        "/api/auth/google/callback",
        params={"code": "b", "state": "state-abc"},
        follow_redirects=False,
    )
    assert second.status_code == 302

    engine = create_async_engine(settings.test_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        assert await _user_count(session) == 1
        user = (
            await session.execute(select(User).where(User.google_sub == "google-sub-stable"))
        ).scalar_one()
        assert user.email == "same@example.com"
    await engine.dispose()
    await reset_engine()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_google_callback_links_existing_dev_user_by_verified_email(
    client: AsyncClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    get_settings.cache_clear()

    login = await client.post(
        "/api/auth/dev-login",
        json={"email": "linkme@example.com", "name": "Dev"},
    )
    assert login.status_code == 200
    existing_id = UUID(login.json()["id"])

    monkeypatch.setattr(
        "dictably.api.auth.google_oauth.exchange_code_for_id_token",
        AsyncMock(
            return_value={
                "sub": "google-sub-link",
                "email": "linkme@example.com",
                "email_verified": True,
                "name": "Linked",
            }
        ),
    )
    client.cookies.set(auth_domain.OAUTH_STATE_COOKIE, _pending_cookie())
    res = await client.get(
        "/api/auth/google/callback",
        params={"code": "c", "state": "state-abc"},
        follow_redirects=False,
    )
    assert res.status_code == 302
    assert "auth_error=" not in res.headers["location"]

    engine = create_async_engine(settings.test_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        assert await _user_count(session) == 1
        user = (await session.execute(select(User).where(User.id == existing_id))).scalar_one()
        assert user.google_sub == "google-sub-link"
        assert user.name == "Linked"
    await engine.dispose()
    await reset_engine()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_google_start_next_whitelist_and_callback_uk(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    get_settings.cache_clear()

    start = await client.get(
        "/api/auth/google/start",
        params={"next": "/uk/app/"},
        follow_redirects=False,
    )
    assert start.status_code == 302
    assert "accounts.google.com" in start.headers["location"]
    assert "code_challenge=" in start.headers["location"]
    assert auth_domain.OAUTH_STATE_COOKIE in start.cookies

    # Spoofed next in query on callback must not open-redirect: only cookie next is used.
    monkeypatch.setattr(
        "dictably.api.auth.google_oauth.exchange_code_for_id_token",
        AsyncMock(
            return_value={
                "sub": "g-uk",
                "email": "uk@example.com",
                "email_verified": True,
            }
        ),
    )
    # Evil next packed into cookie is sanitized when packing — use whitelist path.
    client.cookies.set(
        auth_domain.OAUTH_STATE_COOKIE,
        _pending_cookie(next_path="/uk/app/", state="state-abc"),
    )
    cb = await client.get(
        "/api/auth/google/callback",
        params={"code": "z", "state": "state-abc"},
        follow_redirects=False,
    )
    assert cb.status_code == 302
    assert "/uk/app/" in cb.headers["location"]

    bad_start = await client.get(
        "/api/auth/google/start",
        params={"next": "https://evil.example/phish"},
        follow_redirects=False,
    )
    assert bad_start.status_code == 302
    # Cookie next should fall back to /app/
    from dictably.domain.google_oauth import unpack_oauth_cookie

    pending = unpack_oauth_cookie(bad_start.cookies.get(auth_domain.OAUTH_STATE_COOKIE))
    assert pending is not None
    assert pending.next_path == "/app/"
    get_settings.cache_clear()
