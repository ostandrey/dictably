from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.cookies import clear_session_cookies
from dictably.api.deps import client_ip, require_user, require_user_csrf
from dictably.api.schemas import ConsentIn, OnboardingIn, UserOut
from dictably.core.config import Settings, get_settings
from dictably.db.models import User
from dictably.db.session import get_db
from dictably.domain import account as account_domain
from dictably.domain import ledger as ledger_domain
from dictably.providers.factory import get_storage_provider

router = APIRouter(tags=["me"])


def user_out(user: User, *, balance_seconds: int = 0) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        role=user.role,
        balance_seconds=balance_seconds,
        timezone=user.timezone,
        needs_consent=account_domain.needs_consent(user),
        needs_onboarding=account_domain.needs_onboarding(user),
        marketing_opt_in=user.marketing_opt_in,
        terms_version=user.terms_version,
        consent_terms_at=user.consent_terms_at,
        onboarding_completed_at=user.onboarding_completed_at,
        onboarding_skipped_at=user.onboarding_skipped_at,
    )


@router.get("/me", response_model=UserOut)
async def me(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    balance = await ledger_domain.balance_seconds(session, user.id)
    return user_out(user, balance_seconds=balance)


@router.post("/me/consent", response_model=UserOut)
async def post_consent(
    body: ConsentIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    await account_domain.accept_consent(
        session,
        user,
        marketing_opt_in=body.marketing_opt_in,
        timezone=body.timezone,
        locale=body.locale,
        signup_utm=body.signup_utm,
        signup_referrer=body.signup_referrer,
    )
    await session.commit()
    await session.refresh(user)
    balance = await ledger_domain.balance_seconds(session, user.id)
    return user_out(user, balance_seconds=balance)


@router.post("/me/onboarding", response_model=UserOut)
async def post_onboarding(
    body: OnboardingIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    await account_domain.complete_onboarding(
        session,
        user,
        use_cases=body.use_cases,
        meeting_locale=body.meeting_locale,
        skipped=body.skipped,
    )
    await session.commit()
    await session.refresh(user)
    balance = await ledger_domain.balance_seconds(session, user.id)
    return user_out(user, balance_seconds=balance)


@router.get("/me/export")
async def export_account(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    return await account_domain.build_export(session, user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    storage = get_storage_provider()
    await account_domain.delete_account(
        session,
        storage,
        user=user,
        ip=client_ip(request, settings),
    )
    clear_session_cookies(response, settings=settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
