"""T-039 cursor pagination + no N+1 speaker counts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import event, select

from dictably.db.models import Media, MediaStatus, Speaker, User
from dictably.db.session import get_session_factory
from dictably.domain import auth as auth_domain


async def _login(client: AsyncClient, email: str) -> UUID:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Pager"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        return user.id


async def _seed_media(
    user_id: UUID,
    *,
    n: int,
    filename_prefix: str = "rec",
) -> list[Media]:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    factory = get_session_factory()
    rows: list[Media] = []
    async with factory() as session:
        for i in range(n):
            row = Media(
                id=uuid4(),
                user_id=user_id,
                filename=f"{filename_prefix}-{i:03d}.m4a",
                mime="audio/mp4",
                size_bytes=100,
                duration_ms=1000,
                status=MediaStatus.ready,
                storage_keys={},
            )
            row.created_at = base + timedelta(seconds=i)
            session.add(row)
            rows.append(row)
        await session.commit()
        for row in rows:
            await session.refresh(row)
    return rows


@pytest.mark.asyncio
async def test_media_cursor_pages_45(client: AsyncClient) -> None:
    uid = await _login(client, "page45@example.com")
    await _seed_media(uid, n=45)

    page1 = await client.get("/api/media", params={"limit": 20})
    assert page1.status_code == 200, page1.text
    b1 = page1.json()
    assert len(b1["items"]) == 20
    assert b1["next_cursor"]
    ids1 = [x["id"] for x in b1["items"]]

    page2 = await client.get("/api/media", params={"limit": 20, "cursor": b1["next_cursor"]})
    assert page2.status_code == 200
    b2 = page2.json()
    assert len(b2["items"]) == 20
    assert b2["next_cursor"]
    ids2 = [x["id"] for x in b2["items"]]

    newer_id = uuid4()
    factory = get_session_factory()
    async with factory() as session:
        newer = Media(
            id=newer_id,
            user_id=uid,
            filename="brand-new.m4a",
            mime="audio/mp4",
            size_bytes=1,
            duration_ms=1,
            status=MediaStatus.ready,
            storage_keys={},
        )
        newer.created_at = datetime(2026, 6, 1, tzinfo=UTC)
        session.add(newer)
        await session.commit()

    page3 = await client.get("/api/media", params={"limit": 20, "cursor": b2["next_cursor"]})
    assert page3.status_code == 200
    b3 = page3.json()
    assert len(b3["items"]) == 5
    assert b3["next_cursor"] is None
    ids3 = [x["id"] for x in b3["items"]]

    all_ids = ids1 + ids2 + ids3
    assert len(all_ids) == 45
    assert len(set(all_ids)) == 45
    assert str(newer_id) not in all_ids


@pytest.mark.asyncio
async def test_media_bad_cursor_400(client: AsyncClient) -> None:
    await _login(client, "badcur@example.com")
    res = await client.get("/api/media", params={"cursor": "!!!not-a-cursor"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_media_search_q(client: AsyncClient) -> None:
    uid = await _login(client, "search@example.com")
    await _seed_media(uid, n=5, filename_prefix="alpha")
    await _seed_media(uid, n=3, filename_prefix="beta")

    res = await client.get("/api/media", params={"q": "beta", "limit": 20})
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 3
    assert all("beta" in x["filename"] for x in items)


@pytest.mark.asyncio
async def test_speaker_counts_no_n_plus_1(client: AsyncClient) -> None:
    uid = await _login(client, "n1@example.com")
    rows = await _seed_media(uid, n=20)
    factory = get_session_factory()
    async with factory() as session:
        for row in rows:
            for j in range(3):
                session.add(
                    Speaker(
                        id=uuid4(),
                        media_id=row.id,
                        label=f"S{j}",
                        color_idx=j,
                    )
                )
        await session.commit()

    from dictably.db.session import get_engine

    engine = get_engine()
    statements: list[str] = []

    def before_cursor(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        statements.append(str(statement))

    event.listen(engine.sync_engine, "before_cursor_execute", before_cursor)
    try:
        res = await client.get("/api/media", params={"limit": 20})
        assert res.status_code == 200
        items = res.json()["items"]
        assert len(items) == 20
        assert all(x["speaker_count"] == 3 for x in items)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", before_cursor)

    speaker_q = [s for s in statements if "speaker" in s.lower()]
    assert len(speaker_q) <= 3, f"too many speaker queries: {len(speaker_q)}\n{speaker_q}"


@pytest.mark.asyncio
async def test_media_status_endpoint(client: AsyncClient) -> None:
    uid = await _login(client, "status@example.com")
    rows = await _seed_media(uid, n=2)
    factory = get_session_factory()
    async with factory() as session:
        for j in range(2):
            session.add(
                Speaker(
                    id=uuid4(),
                    media_id=rows[0].id,
                    label=f"S{j}",
                    color_idx=j,
                )
            )
        await session.commit()

    ids = ",".join(str(r.id) for r in rows)
    res = await client.get("/api/media/status", params={"ids": ids})
    assert res.status_code == 200
    body = res.json()["items"]
    assert len(body) == 2
    assert {x["id"] for x in body} == {str(r.id) for r in rows}
    by_id = {x["id"]: x for x in body}
    assert by_id[str(rows[0].id)]["speaker_count"] == 2
    assert by_id[str(rows[1].id)]["speaker_count"] == 0
