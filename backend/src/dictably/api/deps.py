from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import Settings, get_settings
from dictably.db.models import User
from dictably.db.session import get_db
from dictably.domain import auth as auth_domain


async def get_current_user_optional(
    session: Annotated[AsyncSession, Depends(get_db)],
    dictably_session: Annotated[str | None, Cookie(alias=auth_domain.SESSION_COOKIE)] = None,
) -> User | None:
    resolved = await auth_domain.resolve_session(session, dictably_session)
    if resolved is None:
        return None
    return resolved[0]


async def require_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


async def require_csrf(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    x_csrf_token: Annotated[str | None, Header(alias=auth_domain.CSRF_HEADER)] = None,
    dictably_csrf: Annotated[str | None, Cookie(alias=auth_domain.CSRF_COOKIE)] = None,
) -> None:
    """Double-submit CSRF + Origin/Referer check for cookie-authenticated mutations."""
    if (
        not x_csrf_token
        or not dictably_csrf
        or not hmac.compare_digest(x_csrf_token, dictably_csrf)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")

    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    allowed = settings.public_app_url.rstrip("/")
    if origin:
        if origin.rstrip("/") != allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Origin")
    elif referer:
        if not referer.startswith(allowed + "/") and referer.rstrip("/") != allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Referer")
    elif settings.is_prod:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing Origin")


def client_ip(request: Request, settings: Settings | None = None) -> str:
    """Peer IP, optionally peeling trusted proxy hops from X-Forwarded-For (rightmost)."""
    settings = settings or get_settings()
    peer = request.client.host[:64] if request.client else "unknown"
    hops = max(0, settings.trusted_proxy_hops)
    if hops == 0:
        return peer
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if len(parts) < hops:
        return peer
    # XFF: client, …, proxyN — take the entry just before the trusted proxy chain.
    return parts[-hops][:64]
