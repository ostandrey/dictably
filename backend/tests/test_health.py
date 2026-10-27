import pytest
from httpx import ASGITransport, AsyncClient

from dictably.core.config import Settings, get_settings
from dictably.main import create_app


@pytest.mark.asyncio
async def test_health_ok(client: AsyncClient) -> None:
    res = await client.get("/api/health")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"]["ok"] is True
    assert body["checks"]["redis"]["ok"] is True
    assert body["asr_provider"] == "fake"
    assert body["llm_provider"] == "fake"


@pytest.mark.asyncio
async def test_docs_hidden_when_env_default_prod(monkeypatch: pytest.MonkeyPatch) -> None:
    """S1: no ENV (and no .env) → prod → /api/docs is 404."""
    monkeypatch.delenv("ENV", raising=False)
    get_settings.cache_clear()
    prod = Settings(_env_file=None)
    assert prod.env == "prod"
    assert prod.is_dev is False

    monkeypatch.setattr("dictably.main.get_settings", lambda: prod)
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/docs")
        assert res.status_code == 404
    get_settings.cache_clear()
