"""Account consent, onboarding, export, delete (T-033)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Analysis, AuditLog, Media, Speaker, Transcript, User
from dictably.domain.minutes_templates import normalize_template, template_from_use_cases
from dictably.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)

# Bump when Terms/Privacy material change; stored on consent accept.
TERMS_VERSION = "2026-10-29"

ALLOWED_USE_CASES = frozenset(
    {
        "client_meetings",
        "internal",
        "interviews",
        "training",
        "other",
    }
)

ALLOWED_MEETING_LOCALES = frozenset({"en", "uk", "pl", "de", "es", "other"})

UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


def needs_consent(user: User) -> bool:
    return user.consent_terms_at is None


def needs_onboarding(user: User) -> bool:
    if needs_consent(user):
        return False
    return user.onboarding_completed_at is None and user.onboarding_skipped_at is None


def sanitize_utm(raw: dict[str, Any] | None) -> dict[str, str]:
    if not raw:
        return {}
    out: dict[str, str] = {}
    for key in UTM_KEYS:
        val = raw.get(key)
        if isinstance(val, str) and val.strip():
            out[key] = val.strip()[:128]
    return out


def sanitize_referrer(raw: str | None) -> str | None:
    """Keep scheme + host only — full URLs may leak PII in query strings (T-033 S3)."""
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    try:
        parsed = urlparse(cleaned)
    except ValueError:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"[:512]


def sanitize_timezone(raw: str | None) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip()[:64]
    return cleaned or None


def sanitize_locale(raw: str | None) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip().lower()[:16]
    if cleaned in {"en", "uk"}:
        return cleaned
    return None


async def accept_consent(
    session: AsyncSession,
    user: User,
    *,
    marketing_opt_in: bool,
    timezone: str | None = None,
    locale: str | None = None,
    signup_utm: dict[str, Any] | None = None,
    signup_referrer: str | None = None,
) -> User:
    now = datetime.now(UTC)
    user.consent_terms_at = now
    user.terms_version = TERMS_VERSION
    user.marketing_opt_in = bool(marketing_opt_in)
    user.marketing_opt_in_at = now if marketing_opt_in else None

    tz = sanitize_timezone(timezone)
    if tz:
        user.timezone = tz
    loc = sanitize_locale(locale)
    if loc:
        user.locale = loc

    # First-touch only — never overwrite once set.
    if not user.signup_utm:
        utm = sanitize_utm(signup_utm)
        if utm:
            user.signup_utm = utm
    if not user.signup_referrer:
        ref = sanitize_referrer(signup_referrer)
        if ref:
            user.signup_referrer = ref

    await session.flush()
    return user


async def complete_onboarding(
    session: AsyncSession,
    user: User,
    *,
    use_cases: list[str] | None,
    meeting_locale: str | None,
    skipped: bool,
) -> User:
    now = datetime.now(UTC)
    if skipped:
        user.onboarding_skipped_at = now
        user.onboarding_completed_at = None
    else:
        cases = [c for c in (use_cases or []) if c in ALLOWED_USE_CASES]
        # Dedupe preserve order
        seen: set[str] = set()
        ordered: list[str] = []
        for c in cases:
            if c not in seen:
                seen.add(c)
                ordered.append(c)
        user.onboarding_use_cases = ordered[:5]
        if meeting_locale and meeting_locale in ALLOWED_MEETING_LOCALES:
            user.onboarding_meeting_locale = meeting_locale
        user.onboarding_completed_at = now
        user.onboarding_skipped_at = None
        # S2: internal → official protocol; else minutes (user can change later).
        user.preferred_minutes_template = template_from_use_cases(ordered)
    await session.flush()
    return user


def remember_minutes_template(user: User, template: str | None) -> str:
    """Persist last chosen template as the user's default (T-027 B2)."""
    tid = normalize_template(template)
    user.preferred_minutes_template = tid
    return tid


async def build_export(session: AsyncSession, user: User) -> dict[str, Any]:
    """JSON dump of the account — transcripts + latest minutes; no audio blobs (T-033 S2)."""
    result = await session.execute(
        select(Media).where(Media.user_id == user.id).order_by(Media.created_at.desc())
    )
    media_rows = list(result.scalars().all())
    recordings: list[dict[str, Any]] = []
    for m in media_rows:
        tr = await session.get(Transcript, m.id)
        speakers = (
            (await session.execute(select(Speaker).where(Speaker.media_id == m.id))).scalars().all()
        )
        latest = (
            await session.execute(
                select(Analysis)
                .where(Analysis.media_id == m.id)
                .order_by(Analysis.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        entry: dict[str, Any] = {
            "id": str(m.id),
            "filename": m.filename,
            "mime": m.mime,
            "size_bytes": m.size_bytes,
            "duration_ms": m.duration_ms,
            "status": m.status,
            "language": m.language,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "speakers": [
                {
                    "id": str(s.id),
                    "label": s.label,
                    "display_name": s.display_name,
                    "party": s.party,
                    "color_idx": s.color_idx,
                }
                for s in speakers
            ],
            "transcript": None,
            "minutes": None,
        }
        if tr is not None:
            entry["transcript"] = {
                "provider": tr.provider,
                "model": tr.model,
                "language": tr.language,
                "segments": tr.segments or [],
                "words": tr.words or [],
            }
        if latest is not None:
            entry["minutes"] = {
                "id": str(latest.id),
                "provider": latest.provider,
                "model": latest.model,
                "template": latest.template,
                "created_at": latest.created_at.isoformat() if latest.created_at else None,
                "result": latest.result or {},
            }
        recordings.append(entry)

    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "locale": user.locale,
            "timezone": user.timezone,
            "role": user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "consent_terms_at": (
                user.consent_terms_at.isoformat() if user.consent_terms_at else None
            ),
            "terms_version": user.terms_version,
            "marketing_opt_in": user.marketing_opt_in,
            "marketing_opt_in_at": (
                user.marketing_opt_in_at.isoformat() if user.marketing_opt_in_at else None
            ),
            "signup_utm": user.signup_utm or {},
            "signup_referrer": user.signup_referrer,
            "onboarding_use_cases": user.onboarding_use_cases or [],
            "onboarding_meeting_locale": user.onboarding_meeting_locale,
            "onboarding_completed_at": (
                user.onboarding_completed_at.isoformat() if user.onboarding_completed_at else None
            ),
            "onboarding_skipped_at": (
                user.onboarding_skipped_at.isoformat() if user.onboarding_skipped_at else None
            ),
        },
        "recordings": recordings,
    }


async def delete_account(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user: User,
    ip: str | None = None,
) -> None:
    """Wipe all media files + DB user (CASCADE sessions/media/ledger). Force even if busy."""
    result = await session.execute(select(Media).where(Media.user_id == user.id))
    media_rows = list(result.scalars().all())
    for media in media_rows:
        keys = [str(v) for v in (media.storage_keys or {}).values() if v]
        for key in keys:
            try:
                await storage.delete(key)
            except Exception:  # noqa: BLE001 — best-effort
                logger.exception("failed to delete storage key %s on account wipe %s", key, user.id)

    session.add(
        AuditLog(
            user_id=user.id,
            action="account_delete",
            target=f"user:{user.id}",
            ip=ip,
        )
    )
    await session.flush()

    # Core DELETE — FK SET NULL on audit; CASCADE clears children.
    uid: UUID = user.id
    await session.execute(delete(User).where(User.id == uid))
    await session.commit()
