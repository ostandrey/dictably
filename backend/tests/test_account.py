"""T-033: consent, onboarding, export, account delete."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from dictably.db.models import Analysis, Media, MediaStatus, Transcript, User
from dictably.db.session import get_session_factory
from dictably.domain import auth as auth_domain


async def _login(client: AsyncClient, email: str = "alice@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Alice"},
    )
    assert login.status_code == 200, login.text
    return login.cookies[auth_domain.CSRF_COOKIE]


@pytest.mark.asyncio
async def test_consent_and_onboarding_flow(client: AsyncClient) -> None:
    csrf = await _login(client)
    me = await client.get("/api/me")
    assert me.status_code == 200
    body = me.json()
    assert body["needs_consent"] is True
    assert body["needs_onboarding"] is False

    bad = await client.post(
        "/api/me/consent",
        json={"marketing_opt_in": True},
    )
    assert bad.status_code == 403

    ok = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={
            "marketing_opt_in": True,
            "timezone": "Europe/Kyiv",
            "locale": "uk",
            "signup_utm": {"utm_source": "landing", "utm_medium": "cpc"},
            "signup_referrer": "https://t.me/somepath?user=secret",
        },
    )
    assert ok.status_code == 200, ok.text
    after = ok.json()
    assert after["needs_consent"] is False
    assert after["needs_onboarding"] is True
    assert after["marketing_opt_in"] is True
    assert after["timezone"] == "Europe/Kyiv"
    assert after["locale"] == "uk"
    assert after["terms_version"]
    assert after["consent_terms_at"]

    factory = get_session_factory()
    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == "alice@example.com"))
        ).scalar_one()
        # S3: origin only
        assert user.signup_referrer == "https://t.me"

    skip = await client.post(
        "/api/me/onboarding",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"skipped": True},
    )
    assert skip.status_code == 200
    done = skip.json()
    assert done["needs_onboarding"] is False
    assert done["onboarding_skipped_at"]

    me2 = await client.get("/api/me")
    assert me2.json()["needs_onboarding"] is False


@pytest.mark.asyncio
async def test_upload_without_consent_is_forbidden(client: AsyncClient) -> None:
    csrf = await _login(client, "noconsent@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("x.wav", b"abc", "audio/wav")},
    )
    assert up.status_code == 403
    assert up.json()["detail"] == "consent_required"


@pytest.mark.asyncio
async def test_onboarding_complete_stores_chips(client: AsyncClient) -> None:
    csrf = await _login(client, "bob@example.com")
    await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    res = await client.post(
        "/api/me/onboarding",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={
            "skipped": False,
            "use_cases": ["client_meetings", "bogus", "internal"],
            "meeting_locale": "en",
        },
    )
    assert res.status_code == 200
    assert res.json()["needs_onboarding"] is False
    assert res.json()["onboarding_completed_at"]

    factory = get_session_factory()
    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == "bob@example.com"))
        ).scalar_one()
        assert user.onboarding_use_cases == ["client_meetings", "internal"]
        assert user.onboarding_meeting_locale == "en"
        assert user.onboarding_skipped_at is None
        # S2: internal → official protocol
        assert user.preferred_minutes_template == "official_protocol"
    assert res.json()["preferred_minutes_template"] == "official_protocol"


@pytest.mark.asyncio
async def test_export_and_delete_account_isolation(client: AsyncClient) -> None:
    csrf_a = await _login(client, "owner@example.com")
    await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        json={"marketing_opt_in": False},
    )
    await client.post(
        "/api/me/onboarding",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        json={"skipped": True},
    )

    factory = get_session_factory()
    async with factory() as session:
        owner = (
            await session.execute(select(User).where(User.email == "owner@example.com"))
        ).scalar_one()
        other = User(email="other@example.com", name="Other", locale="en")
        session.add(other)
        await session.flush()
        mine = Media(
            user_id=owner.id,
            filename="mine.wav",
            status=MediaStatus.ready,
            storage_keys={},
        )
        session.add(mine)
        await session.flush()
        session.add(
            Transcript(
                media_id=mine.id,
                provider="fake",
                model="t",
                language="en",
                segments=[{"id": "s1", "text": "hello", "start_ms": 0, "end_ms": 100}],
                words=[],
            )
        )
        session.add(
            Analysis(
                media_id=mine.id,
                template="default",
                provider="fake",
                model="m",
                result={"summary": [{"text": "done"}]},
            )
        )
        session.add(
            Media(
                user_id=other.id,
                filename="theirs.wav",
                status=MediaStatus.uploaded,
                storage_keys={},
            )
        )
        await session.commit()
        other_id = other.id

    exported = await client.get("/api/me/export")
    assert exported.status_code == 200
    data = exported.json()
    assert data["user"]["email"] == "owner@example.com"
    assert len(data["recordings"]) == 1
    rec = data["recordings"][0]
    assert rec["filename"] == "mine.wav"
    assert rec["transcript"] is not None
    assert rec["transcript"]["segments"][0]["text"] == "hello"
    assert rec["minutes"] is not None
    assert rec["minutes"]["result"]["summary"][0]["text"] == "done"
    assert "storage_keys" not in rec
    assert all(r["filename"] != "theirs.wav" for r in data["recordings"])

    wiped = await client.delete(
        "/api/me",
        headers={auth_domain.CSRF_HEADER: csrf_a},
    )
    assert wiped.status_code == 204

    me = await client.get("/api/me")
    assert me.status_code == 401

    async with factory() as session:
        gone = (
            await session.execute(select(User).where(User.email == "owner@example.com"))
        ).scalar_one_or_none()
        assert gone is None
        survivor = (
            await session.execute(select(User).where(User.id == other_id))
        ).scalar_one_or_none()
        assert survivor is not None
        theirs = (
            (await session.execute(select(Media).where(Media.user_id == other_id))).scalars().all()
        )
        assert len(theirs) == 1
        assert theirs[0].filename == "theirs.wav"
