"""T-034: product events — cohort funnel, no recording content."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from dictably.db.models import ProductEvent, User
from dictably.db.session import get_session_factory
from dictably.domain import analytics as analytics_domain
from dictably.domain import auth as auth_domain


async def _login(client: AsyncClient, email: str) -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Analytics"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={
            "marketing_opt_in": False,
            "signup_utm": {"utm_source": "landing", "utm_medium": "cpc"},
        },
    )
    assert cons.status_code == 200, cons.text
    return csrf


def test_sanitize_props_strips_forbidden() -> None:
    clean = analytics_domain._sanitize_props(
        {
            "format": "docx",
            "text": "secret transcript line",
            "filename": "call.m4a",
            "kind": "minutes",
            "long": "x" * 100,
        }
    )
    assert clean == {"format": "docx", "kind": "minutes"}
    assert analytics_domain.props_looks_safe(clean)
    assert not analytics_domain.props_looks_safe({"text": "hi"})


@pytest.mark.asyncio
async def test_cohort_funnel_excludes_admin_and_dev(client: AsyncClient) -> None:
    """B1: 3 real users (export / upload / signup only); admin+dev events ignored."""
    await _login(client, "funnel-admin@example.com")

    factory = get_session_factory()
    async with factory() as session:
        admin = (
            await session.execute(select(User).where(User.email == "funnel-admin@example.com"))
        ).scalar_one()
        admin.role = "admin"
        # Admin noise must not enter cohort.
        await analytics_domain.track(
            session,
            name=analytics_domain.EVENT_UPLOADED,
            user_id=admin.id,
        )

        now = datetime.now(UTC)

        async def make_user(email: str, *, provider: str = "google") -> User:
            u = User(email=email, name=email, locale="en", role="user")
            u.created_at = now - timedelta(hours=1)
            u.signup_utm = {"utm_source": "landing"}
            session.add(u)
            await session.flush()
            await analytics_domain.track(
                session,
                name=analytics_domain.EVENT_SIGNED_UP,
                user_id=u.id,
                props={"provider": provider},
            )
            return u

        u_export = await make_user("cohort-export@example.com")
        u_upload = await make_user("cohort-upload@example.com")
        u_only = await make_user("cohort-only@example.com")
        # Dev-login user in window — excluded entirely.
        await make_user("cohort-dev@example.com", provider="dev")

        for name in (
            analytics_domain.EVENT_UPLOADED,
            analytics_domain.EVENT_PROCESSING_READY,
            analytics_domain.EVENT_MINUTES_VIEWED,
            analytics_domain.EVENT_EXPORT_DOWNLOADED,
        ):
            await analytics_domain.track(session, name=name, user_id=u_export.id)

        await analytics_domain.track(
            session,
            name=analytics_domain.EVENT_UPLOADED,
            user_id=u_upload.id,
        )
        await session.commit()
        _ = u_only

    funnel = await client.get("/api/admin/funnel?days=7")
    assert funnel.status_code == 200, funnel.text
    data = funnel.json()
    assert data["cohort"] == 3
    by = {s["name"]: s for s in data["steps"]}
    assert by["signed_up"]["users"] == 3
    assert by["signed_up"]["pct_signups"] == 100.0
    assert by["uploaded"]["users"] == 2
    assert by["uploaded"]["pct_signups"] == pytest.approx(66.7, abs=0.1)
    assert by["uploaded"]["pct_prev"] == pytest.approx(66.7, abs=0.1)
    assert by["processing_ready"]["users"] == 1
    assert by["export_downloaded"]["users"] == 1
    assert by["export_downloaded"]["pct_signups"] == pytest.approx(33.3, abs=0.1)
    # N2: failed branch % is vs uploaded (0 failed here).
    assert by["processing_failed"]["branch_of"] == "uploaded"
    assert by["processing_failed"]["users"] == 0
    assert by["processing_failed"]["pct_prev"] == 0.0
    # Admin/dev not in sources as separate cohort members beyond the 3.
    assert sum(s["users"] for s in data["sources"]) == 3

    await _login(client, "funnel-pleb@example.com")
    denied = await client.get("/api/admin/funnel?days=7")
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_minutes_viewed_once_per_day(client: AsyncClient) -> None:
    """S3: second view same day does not insert another row."""
    from dictably.db.models import Media, MediaStatus

    await _login(client, "view-once@example.com")
    factory = get_session_factory()
    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == "view-once@example.com"))
        ).scalar_one()
        media = Media(
            user_id=user.id,
            filename="v.wav",
            status=MediaStatus.ready,
            storage_keys={},
        )
        session.add(media)
        await session.flush()
        a = await analytics_domain.track_minutes_viewed(session, user_id=user.id, media_id=media.id)
        b = await analytics_domain.track_minutes_viewed(session, user_id=user.id, media_id=media.id)
        await session.commit()
        assert a is not None
        assert b is None
        n = (
            (
                await session.execute(
                    select(ProductEvent).where(
                        ProductEvent.name == analytics_domain.EVENT_MINUTES_VIEWED,
                        ProductEvent.user_id == user.id,
                        ProductEvent.media_id == media.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(n) == 1
