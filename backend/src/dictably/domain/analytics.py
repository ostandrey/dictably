"""Server-side product analytics (T-034). Never store transcript/minutes text or IP."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import ProductEvent, User

# Allowed event names (MVP). `paid` reserved for billing later.
EVENT_SIGNED_UP = "signed_up"
EVENT_UPLOADED = "uploaded"
EVENT_PROCESSING_READY = "processing_ready"
EVENT_PROCESSING_FAILED = "processing_failed"
EVENT_MINUTES_VIEWED = "minutes_viewed"
EVENT_EXPORT_DOWNLOADED = "export_downloaded"
EVENT_REGENERATED = "regenerated"
EVENT_PAID = "paid"

# Cohort funnel order (processing_failed sits under ready — S1).
FUNNEL_EVENTS = (
    EVENT_SIGNED_UP,
    EVENT_UPLOADED,
    EVENT_PROCESSING_READY,
    EVENT_PROCESSING_FAILED,
    EVENT_MINUTES_VIEWED,
    EVENT_EXPORT_DOWNLOADED,
    EVENT_REGENERATED,
)

# Props keys that may never appear (defense in depth).
_FORBIDDEN_PROP_KEYS = frozenset(
    {
        "text",
        "transcript",
        "minutes",
        "body",
        "quote",
        "filename",
        "email",
        "ip",
        "content",
        "segments",
        "words",
        "result",
    }
)


def _sanitize_props(props: dict[str, Any] | None) -> dict[str, Any]:
    if not props:
        return {}
    out: dict[str, Any] = {}
    for key, value in props.items():
        k = str(key)[:64]
        if k.lower() in _FORBIDDEN_PROP_KEYS:
            continue
        if isinstance(value, str):
            # Short codes only (format, template, kind) — never long text.
            if len(value) > 64:
                continue
            out[k] = value
        elif isinstance(value, (bool, int, float)):
            out[k] = value
        elif value is None:
            continue
        else:
            continue
    return out


async def track(
    session: AsyncSession,
    *,
    name: str,
    user_id: UUID | None = None,
    media_id: UUID | None = None,
    props: dict[str, Any] | None = None,
) -> ProductEvent:
    row = ProductEvent(
        name=name[:64],
        user_id=user_id,
        media_id=media_id,
        props=_sanitize_props(props),
    )
    session.add(row)
    await session.flush()
    return row


async def track_minutes_viewed(
    session: AsyncSession,
    *,
    user_id: UUID,
    media_id: UUID,
) -> ProductEvent | None:
    """S3: at most one minutes_viewed per user+media per UTC day."""
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    existing = (
        await session.execute(
            select(ProductEvent.id)
            .where(ProductEvent.name == EVENT_MINUTES_VIEWED)
            .where(ProductEvent.user_id == user_id)
            .where(ProductEvent.media_id == media_id)
            .where(ProductEvent.created_at >= day_start)
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return None
    return await track(
        session,
        name=EVENT_MINUTES_VIEWED,
        user_id=user_id,
        media_id=media_id,
    )


def _since(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=max(1, min(days, 90)))


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round(100.0 * part / whole, 1)


async def _excluded_user_ids(session: AsyncSession) -> set[UUID]:
    """Admins + anyone who signed up via Dev login."""
    admin_ids = set(
        (await session.execute(select(User.id).where(User.role == "admin"))).scalars().all()
    )
    # JSONB → provider == "dev"
    dev_ids = set(
        (
            await session.execute(
                select(ProductEvent.user_id)
                .where(ProductEvent.name == EVENT_SIGNED_UP)
                .where(ProductEvent.user_id.is_not(None))
                .where(ProductEvent.props["provider"].as_string() == "dev")
            )
        )
        .scalars()
        .all()
    )
    return {uid for uid in (admin_ids | dev_ids) if uid is not None}


async def funnel_report(session: AsyncSession, *, days: int = 7) -> dict[str, Any]:
    """B1: cohort funnel — users who signed up in window, steps reached any time after."""
    since = _since(days)
    excluded = await _excluded_user_ids(session)

    cohort_rows = (
        await session.execute(select(User.id, User.signup_utm).where(User.created_at >= since))
    ).all()
    cohort_ids = [uid for uid, _utm in cohort_rows if uid not in excluded]
    cohort_set = set(cohort_ids)
    cohort_n = len(cohort_ids)

    # Events reached by cohort members (any time — typically after signup).
    reached: dict[str, set[UUID]] = {name: set() for name in FUNNEL_EVENTS}
    if cohort_set:
        ev_rows = (
            await session.execute(
                select(ProductEvent.name, ProductEvent.user_id)
                .where(ProductEvent.user_id.in_(cohort_set))
                .where(ProductEvent.name.in_(FUNNEL_EVENTS))
            )
        ).all()
        for name, uid in ev_rows:
            if uid is not None and name in reached:
                reached[name].add(uid)

    # signed_up = entire cohort (they registered in window).
    reached[EVENT_SIGNED_UP] = set(cohort_ids)

    steps: list[dict[str, Any]] = []
    prev_users = cohort_n
    for name in FUNNEL_EVENTS:
        users_n = len(reached[name])
        steps.append(
            {
                "name": name,
                "users": users_n,
                "pct_signups": _pct(users_n, cohort_n),
                "pct_prev": _pct(users_n, prev_users)
                if name != EVENT_SIGNED_UP
                else 100.0
                if cohort_n
                else 0.0,
            }
        )
        # processing_failed is a side branch — don't become "previous" for minutes_viewed.
        if name != EVENT_PROCESSING_FAILED:
            prev_users = users_n

    # Active in period: unique non-excluded users with any event in window.
    active_q = select(func.count(func.distinct(ProductEvent.user_id))).where(
        ProductEvent.created_at >= since,
        ProductEvent.user_id.is_not(None),
    )
    if excluded:
        active_q = active_q.where(ProductEvent.user_id.not_in(excluded))
    active_users = int((await session.execute(active_q)).scalar_one() or 0)

    # UTM sources for cohort only.
    sources: dict[str, int] = {}
    for uid, utm in cohort_rows:
        if uid in excluded:
            continue
        raw = utm or {}
        src = (raw.get("utm_source") or "").strip() or "(none)"
        sources[src] = sources.get(src, 0) + 1
    sources_sorted = [
        {"source": k, "users": v}
        for k, v in sorted(sources.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return {
        "days": days,
        "since": since.isoformat(),
        "cohort": cohort_n,
        "active_users": active_users,
        "steps": steps,
        "sources": sources_sorted,
    }


def props_looks_safe(props: dict[str, Any] | None) -> bool:
    """Test helper: reject props that look like recording content."""
    if not props:
        return True
    for k, v in props.items():
        if str(k).lower() in _FORBIDDEN_PROP_KEYS:
            return False
        if isinstance(v, str) and len(v) > 64:
            return False
    return True
