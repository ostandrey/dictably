from __future__ import annotations

from fastapi import Response

from dictably.core.config import Settings
from dictably.domain import auth as auth_domain
from dictably.domain.google_oauth import OAuthPending, pack_oauth_cookie


def set_session_cookies(
    response: Response,
    *,
    settings: Settings,
    session_token: str,
    csrf_token: str,
) -> None:
    max_age = settings.session_ttl_days * 24 * 60 * 60
    common = {
        "max_age": max_age,
        "path": "/",
        "secure": settings.cookies_secure,
        "samesite": "lax",
    }
    response.set_cookie(
        key=auth_domain.SESSION_COOKIE,
        value=session_token,
        httponly=True,
        **common,
    )
    response.set_cookie(
        key=auth_domain.CSRF_COOKIE,
        value=csrf_token,
        httponly=False,
        **common,
    )


def clear_session_cookies(response: Response, *, settings: Settings) -> None:
    for name in (
        auth_domain.SESSION_COOKIE,
        auth_domain.CSRF_COOKIE,
        auth_domain.OAUTH_STATE_COOKIE,
    ):
        response.delete_cookie(
            key=name,
            path="/",
            secure=settings.cookies_secure,
            samesite="lax",
        )


def set_oauth_pending_cookie(
    response: Response,
    *,
    settings: Settings,
    pending: OAuthPending,
) -> None:
    response.set_cookie(
        key=auth_domain.OAUTH_STATE_COOKIE,
        value=pack_oauth_cookie(pending),
        max_age=600,
        path="/",
        httponly=True,
        secure=settings.cookies_secure,
        samesite="lax",
    )


def clear_oauth_pending_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        key=auth_domain.OAUTH_STATE_COOKIE,
        path="/",
        secure=settings.cookies_secure,
        samesite="lax",
    )
