from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Session, User

SESSION_COOKIE = "dictably_session"
CSRF_COOKIE = "dictably_csrf"
CSRF_HEADER = "X-CSRF-Token"
OAUTH_STATE_COOKIE = "dictably_oauth_state"


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_google_sub(session: AsyncSession, google_sub: str) -> User | None:
    result = await session.execute(select(User).where(User.google_sub == google_sub))
    return result.scalar_one_or_none()


async def upsert_google_user(
    session: AsyncSession,
    *,
    google_sub: str,
    email: str,
    name: str | None,
    locale: str = "en",
) -> User:
    email_norm = email.lower().strip()
    user = await get_user_by_google_sub(session, google_sub)
    if user is None:
        user = await get_user_by_email(session, email_norm)
    if user is None:
        user = User(
            email=email_norm,
            name=name,
            locale=locale,
            google_sub=google_sub,
        )
        session.add(user)
    else:
        user.email = email_norm
        if name:
            user.name = name
        user.google_sub = google_sub
    await session.flush()
    return user


async def upsert_dev_user(
    session: AsyncSession,
    *,
    email: str,
    name: str | None = "Dev User",
) -> User:
    email_norm = email.lower().strip()
    user = await get_user_by_email(session, email_norm)
    if user is not None:
        return user
    try:
        async with session.begin_nested():
            user = User(email=email_norm, name=name, locale="en")
            session.add(user)
            await session.flush()
        return user
    except IntegrityError:
        # Parallel e2e / concurrent Dev login — email unique race.
        existing = await get_user_by_email(session, email_norm)
        if existing is None:
            raise
        return existing


async def create_session(
    session: AsyncSession,
    *,
    user_id: UUID,
    ttl_days: int,
    ip: str | None,
    user_agent: str | None,
) -> tuple[str, Session]:
    raw = new_token()
    row = Session(
        token_hash=hash_token(raw),
        user_id=user_id,
        expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
        ip=ip,
        user_agent=(user_agent or "")[:512] or None,
    )
    session.add(row)
    await session.flush()
    return raw, row


async def revoke_session(session: AsyncSession, raw_token: str | None) -> None:
    if not raw_token:
        return
    result = await session.execute(
        select(Session).where(Session.token_hash == hash_token(raw_token))
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await session.delete(row)
        await session.flush()


async def resolve_session(
    session: AsyncSession, raw_token: str | None
) -> tuple[User, Session] | None:
    if not raw_token:
        return None
    result = await session.execute(
        select(Session, User)
        .join(User, User.id == Session.user_id)
        .where(Session.token_hash == hash_token(raw_token))
    )
    pair = result.one_or_none()
    if pair is None:
        return None
    sess, user = pair
    if sess.expires_at <= datetime.now(UTC):
        await session.delete(sess)
        await session.flush()
        return None
    return user, sess
