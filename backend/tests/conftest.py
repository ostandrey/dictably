from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Force fake providers + test env before Settings is cached (AGENTS.md / S1).
os.environ["ASR_PROVIDER"] = "fake"
os.environ["LLM_PROVIDER"] = "fake"
os.environ["ENV"] = "test"
os.environ["DEV_LOGIN"] = "1"
os.environ["PUBLIC_APP_URL"] = "http://test"
os.environ["COOKIE_SECURE"] = "0"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "1000"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://dictably:dictably@127.0.0.1:55432/dictably",
)
os.environ.setdefault(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://dictably:dictably@127.0.0.1:55432/dictably_test",
)
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:56379/0")

from alembic import command
from alembic.config import Config

from dictably.core.config import Settings, get_settings
from dictably.db.session import get_db, reset_engine
from dictably.main import create_app

APP_ORIGIN = "http://test"


def _alembic_upgrade(url: str) -> None:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    # env.py reads get_settings().database_url — temporarily override via env.
    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    try:
        command.upgrade(cfg, "head")
    finally:
        if prev is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = prev
        get_settings.cache_clear()


async def _truncate(session: AsyncSession) -> None:
    for table in (
        "audit_log",
        "credit_ledger",
        "jobs",
        "analyses",
        "speakers",
        "transcripts",
        "media",
        "sessions",
        "users",
    ):
        await session.execute(text(f"TRUNCATE {table} CASCADE"))
    await session.commit()


@pytest.fixture(scope="session")
def settings() -> Settings:
    get_settings.cache_clear()
    s = get_settings()
    _alembic_upgrade(s.test_database_url)
    return s


@pytest_asyncio.fixture
async def db_session(settings: Settings) -> AsyncIterator[AsyncSession]:
    await reset_engine()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await _truncate(session)
        yield session
        await session.rollback()
    await engine.dispose()
    await reset_engine()


@pytest_asyncio.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    await reset_engine()
    get_settings.cache_clear()
    app = create_app()
    engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as warm:
        await _truncate(warm)

    async def _override_db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Origin": APP_ORIGIN},
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
    await engine.dispose()
    await reset_engine()
    get_settings.cache_clear()
