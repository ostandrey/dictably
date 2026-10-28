from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from dictably.core.config import Settings, get_settings
from dictably.domain import auth as auth_domain
from dictably.main import create_app

APP_ORIGIN = "http://test"


@pytest.mark.asyncio
async def test_media_unauthorized(client: AsyncClient) -> None:
    res = await client.get("/api/media")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_dev_login_me_logout_media(client: AsyncClient) -> None:
    cfg = await client.get("/api/auth/config")
    assert cfg.status_code == 200
    assert cfg.json()["dev_login"] is True

    login = await client.post(
        "/api/auth/dev-login",
        json={"email": "owner@example.com", "name": "Owner"},
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert body["email"] == "owner@example.com"
    assert auth_domain.SESSION_COOKIE in login.cookies
    assert auth_domain.CSRF_COOKIE in login.cookies
    csrf = login.cookies[auth_domain.CSRF_COOKIE]

    me = await client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"

    media = await client.get("/api/media")
    assert media.status_code == 200
    assert media.json() == {"items": []}

    bad = await client.post("/api/auth/logout")
    assert bad.status_code == 403

    out = await client.post(
        "/api/auth/logout",
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert out.status_code == 204

    me2 = await client.get("/api/me")
    assert me2.status_code == 401
    media2 = await client.get("/api/media")
    assert media2.status_code == 401


@pytest.mark.asyncio
async def test_dev_login_absent_in_prod(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("DEV_LOGIN", "1")
    monkeypatch.setenv("PUBLIC_APP_URL", APP_ORIGIN)
    get_settings.cache_clear()
    prod = Settings(_env_file=None)
    assert prod.is_prod
    assert prod.dev_login_enabled is False

    monkeypatch.setattr("dictably.main.get_settings", lambda: prod)
    monkeypatch.setattr("dictably.api.auth.get_settings", lambda: prod)
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/auth/dev-login", json={"email": "x@y.com"})
        assert res.status_code == 404
        cfg = await ac.get("/api/auth/config")
        assert cfg.json()["dev_login"] is False
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_google_start_without_credentials(client: AsyncClient) -> None:
    res = await client.get("/api/auth/google/start", follow_redirects=False)
    assert res.status_code == 503
