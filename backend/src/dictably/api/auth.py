from __future__ import annotations

from typing import Annotated
from urllib.parse import urlencode, urljoin

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.cookies import (
    clear_oauth_pending_cookie,
    clear_session_cookies,
    set_oauth_pending_cookie,
    set_session_cookies,
)
from dictably.api.deps import client_ip, require_csrf
from dictably.api.me import user_out
from dictably.api.schemas import AuthConfigOut, DevLoginIn, UserOut
from dictably.core.config import Settings, get_settings
from dictably.db.session import get_db
from dictably.domain import auth as auth_domain
from dictably.domain import google_oauth
from dictably.domain.google_oauth import (
    DEFAULT_NEXT_PATH,
    OAuthPending,
    sanitize_next_path,
)
from dictably.domain.rate_limit import hit_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])

AUTH_ERROR_CODES = frozenset(
    {
        "access_denied",
        "invalid_state",
        "email_unverified",
        "oauth_failed",
        "incomplete_profile",
    }
)


def _app_redirect(
    settings: Settings,
    *,
    next_path: str,
    auth_error: str | None = None,
) -> RedirectResponse:
    path = sanitize_next_path(next_path)
    base = urljoin(settings.public_app_url.rstrip("/") + "/", path.lstrip("/"))
    if auth_error and auth_error in AUTH_ERROR_CODES:
        sep = "&" if "?" in base else "?"
        base = f"{base}{sep}{urlencode({'auth_error': auth_error})}"
    redirect = RedirectResponse(url=base, status_code=status.HTTP_302_FOUND)
    clear_oauth_pending_cookie(redirect, settings=settings)
    return redirect


async def _enforce_auth_rate(request: Request, settings: Settings) -> None:
    ip = client_ip(request, settings)
    over = await hit_rate_limit(
        settings.redis_url,
        key=f"rl:auth:{ip}",
        limit=settings.auth_rate_limit_per_minute,
    )
    if over:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests"
        )


@router.get("/config", response_model=AuthConfigOut)
async def auth_config(settings: Annotated[Settings, Depends(get_settings)]) -> AuthConfigOut:
    return AuthConfigOut(
        google=settings.google_oauth_configured,
        dev_login=settings.dev_login_enabled,
        direct_upload=settings.storage_provider.lower().strip() in {"r2", "s3"},
    )


@router.get("/google/start")
async def google_start(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    next: str | None = None,
) -> RedirectResponse:
    await _enforce_auth_rate(request, settings)
    if not settings.google_oauth_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured",
        )
    next_path = sanitize_next_path(next)
    state = google_oauth.new_oauth_state()
    verifier = google_oauth.new_code_verifier()
    challenge = google_oauth.code_challenge_s256(verifier)
    url = google_oauth.build_google_authorize_url(settings, state=state, code_challenge=challenge)
    redirect = RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)
    set_oauth_pending_cookie(
        redirect,
        settings=settings,
        pending=OAuthPending(state=state, code_verifier=verifier, next_path=next_path),
    )
    return redirect


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    await _enforce_auth_rate(request, settings)
    pending = google_oauth.unpack_oauth_cookie(request.cookies.get(auth_domain.OAUTH_STATE_COOKIE))
    next_path = pending.next_path if pending else DEFAULT_NEXT_PATH

    if error == "access_denied":
        return _app_redirect(settings, next_path=next_path, auth_error="access_denied")
    if error:
        return _app_redirect(settings, next_path=next_path, auth_error="oauth_failed")

    if not code or not state or pending is None or pending.state != state:
        return _app_redirect(settings, next_path=next_path, auth_error="invalid_state")

    try:
        claims = await google_oauth.exchange_code_for_id_token(
            settings, code, code_verifier=pending.code_verifier
        )
    except Exception:  # noqa: BLE001 — surface as user-facing oauth_failed
        return _app_redirect(settings, next_path=next_path, auth_error="oauth_failed")

    sub = claims.get("sub")
    email = claims.get("email")
    if not sub or not email:
        return _app_redirect(settings, next_path=next_path, auth_error="incomplete_profile")

    # B1: never link/create on unverified email (account takeover).
    if claims.get("email_verified") is not True:
        return _app_redirect(settings, next_path=next_path, auth_error="email_unverified")

    user = await auth_domain.upsert_google_user(
        session,
        google_sub=str(sub),
        email=str(email),
        name=claims.get("name"),
    )
    raw, _ = await auth_domain.create_session(
        session,
        user_id=user.id,
        ttl_days=settings.session_ttl_days,
        ip=client_ip(request, settings),
        user_agent=request.headers.get("user-agent"),
    )
    csrf = auth_domain.new_token()
    await session.commit()

    redirect = _app_redirect(settings, next_path=pending.next_path)
    set_session_cookies(redirect, settings=settings, session_token=raw, csrf_token=csrf)
    return redirect


@router.post("/dev-login", response_model=UserOut)
async def dev_login(
    request: Request,
    body: DevLoginIn,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UserOut:
    await _enforce_auth_rate(request, settings)
    if not settings.dev_login_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    user = await auth_domain.upsert_dev_user(session, email=str(body.email), name=body.name)
    raw, _ = await auth_domain.create_session(
        session,
        user_id=user.id,
        ttl_days=settings.session_ttl_days,
        ip=client_ip(request, settings),
        user_agent=request.headers.get("user-agent"),
    )
    csrf = auth_domain.new_token()
    await session.commit()
    set_session_cookies(response, settings=settings, session_token=raw, csrf_token=csrf)
    return user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    _: Annotated[None, Depends(require_csrf)],
) -> Response:
    raw = request.cookies.get(auth_domain.SESSION_COOKIE)
    await auth_domain.revoke_session(session, raw)
    await session.commit()
    clear_session_cookies(response, settings=settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
