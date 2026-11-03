from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.cookies import clear_session_cookies
from dictably.api.deps import client_ip, require_user, require_user_csrf
from dictably.api.schemas import ConsentIn, MePatchIn, OnboardingIn, UserOut, VocabularyLearnIn
from dictably.core.config import Settings, get_settings
from dictably.db.models import User
from dictably.db.session import get_db
from dictably.domain import account as account_domain
from dictably.domain import analytics as analytics_domain
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
        preferred_minutes_template=getattr(user, "preferred_minutes_template", None) or "default",
        notify_ready_email=bool(getattr(user, "notify_ready_email", True)),
        vocabulary=list(getattr(user, "vocabulary", None) or []),
    )


@router.get("/me", response_model=UserOut)
async def me(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UserOut:
    # T-045 N1: backfill trial for users who consented before trial-on-consent.
    await ledger_domain.ensure_trial_grant(session, user_id=user.id, seconds=settings.trial_seconds)
    await session.commit()
    balance = await ledger_domain.balance_seconds(session, user.id)
    return user_out(user, balance_seconds=balance)


@router.patch("/me", response_model=UserOut)
async def patch_me(
    body: MePatchIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    """Update Settings defaults: UI locale + preferred minutes template (T-041)."""
    fields = body.model_fields_set
    if "locale" in fields and body.locale is not None:
        loc = account_domain.sanitize_locale(body.locale)
        if loc:
            user.locale = loc
    if "preferred_minutes_template" in fields and body.preferred_minutes_template is not None:
        account_domain.remember_minutes_template(user, body.preferred_minutes_template)
    if "notify_ready_email" in fields and body.notify_ready_email is not None:
        user.notify_ready_email = bool(body.notify_ready_email)
    if "vocabulary" in fields and body.vocabulary is not None:
        account_domain.set_vocabulary(user, body.vocabulary)
    await session.commit()
    await session.refresh(user)
    balance = await ledger_domain.balance_seconds(session, user.id)
    return user_out(user, balance_seconds=balance)


@router.post("/me/vocabulary", response_model=UserOut)
async def learn_vocabulary(
    body: VocabularyLearnIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    """Remember a corrected term for future uploads (T-042). No word in analytics."""
    added = account_domain.learn_vocabulary_term(user, body.term)
    if added:
        await analytics_domain.track(
            session,
            name=analytics_domain.EVENT_VOCABULARY_LEARNED,
            user_id=user.id,
        )
    await session.commit()
    await session.refresh(user)
    balance = await ledger_domain.balance_seconds(session, user.id)
    return user_out(user, balance_seconds=balance)


@router.post("/me/consent", response_model=UserOut)
async def post_consent(
    body: ConsentIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
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
    # Trial before first upload — Settings + T-040 quota pre-check (idempotent).
    await ledger_domain.ensure_trial_grant(session, user_id=user.id, seconds=settings.trial_seconds)
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
