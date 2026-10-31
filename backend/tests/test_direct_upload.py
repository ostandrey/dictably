"""T-038 B2/B3: direct upload size checks + HEAD-only complete."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select

from dictably.db.models import Media, MediaStatus, User
from dictably.db.session import get_session_factory
from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain


class _FakeS3:
    name = "s3"

    def __init__(self, *, size: int) -> None:
        self._size = size
        self.deleted: list[str] = []

    async def exists(self, key: str) -> bool:
        return True

    async def head_size(self, key: str) -> int | None:
        return self._size

    async def delete(self, key: str) -> None:
        self.deleted.append(key)

    async def get_path(self, key: str):  # noqa: ANN201
        raise AssertionError("complete must not download the object (B3)")


async def _login(client: AsyncClient, email: str) -> None:
    login = await client.post("/api/auth/dev-login", json={"email": email, "name": "U"})
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text


@pytest.mark.asyncio
async def test_complete_rejects_oversized(client: AsyncClient) -> None:
    email = f"size-{uuid4().hex[:8]}@example.com"
    await _login(client, email)
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        m = Media(
            user_id=user.id,
            filename="big.m4a",
            status=MediaStatus.uploading,
            size_bytes=1024,
            storage_keys={"original": "u/x/original.m4a", "declared_size": 1024},
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        storage = _FakeS3(size=media_domain.MAX_UPLOAD_BYTES + 1)
        with pytest.raises(HTTPException) as ei:
            await media_domain.complete_direct_upload(
                session,
                storage,
                user=user,
                media_id=m.id,  # type: ignore[arg-type]
            )
        assert ei.value.status_code == 413
        assert storage.deleted


@pytest.mark.asyncio
async def test_complete_rejects_size_mismatch(client: AsyncClient) -> None:
    email = f"mis-{uuid4().hex[:8]}@example.com"
    await _login(client, email)
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        m = Media(
            user_id=user.id,
            filename="x.m4a",
            status=MediaStatus.uploading,
            size_bytes=100,
            storage_keys={"original": "u/y/original.m4a", "declared_size": 100},
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        storage = _FakeS3(size=999)
        with pytest.raises(HTTPException) as ei:
            await media_domain.complete_direct_upload(
                session,
                storage,
                user=user,
                media_id=m.id,  # type: ignore[arg-type]
            )
        assert ei.value.status_code == 413


@pytest.mark.asyncio
async def test_complete_does_not_call_get_path(client: AsyncClient) -> None:
    email = f"ok-{uuid4().hex[:8]}@example.com"
    await _login(client, email)
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        m = Media(
            user_id=user.id,
            filename="ok.m4a",
            status=MediaStatus.uploading,
            size_bytes=50,
            storage_keys={"original": "u/z/original.m4a", "declared_size": 50},
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        storage = _FakeS3(size=50)
        out = await media_domain.complete_direct_upload(
            session,
            storage,
            user=user,
            media_id=m.id,  # type: ignore[arg-type]
        )
        assert out.status == MediaStatus.uploaded
        assert out.size_bytes == 50
