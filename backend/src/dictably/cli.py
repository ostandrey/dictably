"""CLI helpers. Role admin is assigned here — never via UI (T-019).

Usage:
  cd backend && uv run python -m dictably.cli set-admin user@example.com
  cd backend && uv run python -m dictably.cli set-user user@example.com
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from dictably.core.config import get_settings
from dictably.db.session import get_session_factory, reset_engine
from dictably.domain import admin as admin_domain


async def _set_role(email: str, role: str) -> int:
    get_settings.cache_clear()
    await reset_engine()
    factory = get_session_factory()
    async with factory() as session:
        try:
            user = await admin_domain.set_role_by_email(session, email=email, role=role)
        except LookupError as exc:
            print(str(exc), file=sys.stderr)
            return 1
    print(f"{user.email} -> role={user.role}")
    return 0


async def _seed_funnel() -> int:
    """N1: seed 3–5 normal users with funnel events for admin screenshots."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from dictably.db.models import User
    from dictably.domain import analytics as analytics_domain

    get_settings.cache_clear()
    await reset_engine()
    factory = get_session_factory()
    now = datetime.now(UTC)
    specs = [
        (
            "seed-export@example.com",
            [
                analytics_domain.EVENT_UPLOADED,
                analytics_domain.EVENT_PROCESSING_READY,
                analytics_domain.EVENT_MINUTES_VIEWED,
                analytics_domain.EVENT_EXPORT_DOWNLOADED,
            ],
        ),
        (
            "seed-ready@example.com",
            [
                analytics_domain.EVENT_UPLOADED,
                analytics_domain.EVENT_PROCESSING_READY,
                analytics_domain.EVENT_MINUTES_VIEWED,
            ],
        ),
        ("seed-upload@example.com", [analytics_domain.EVENT_UPLOADED]),
        (
            "seed-fail@example.com",
            [analytics_domain.EVENT_UPLOADED, analytics_domain.EVENT_PROCESSING_FAILED],
        ),
        ("seed-only@example.com", []),
    ]
    async with factory() as session:
        for email, events in specs:
            existing = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if existing:
                u = existing
            else:
                u = User(email=email, name=email.split("@")[0], locale="en", role="user")
                u.created_at = now - timedelta(hours=2)
                u.signup_utm = {"utm_source": "landing"}
                session.add(u)
                await session.flush()
                await analytics_domain.track(
                    session,
                    name=analytics_domain.EVENT_SIGNED_UP,
                    user_id=u.id,
                    props={"provider": "google"},
                )
            for name in events:
                code = (
                    {"code": "asr_failed"}
                    if name == analytics_domain.EVENT_PROCESSING_FAILED
                    else None
                )
                await analytics_domain.track(session, name=name, user_id=u.id, props=code)
        await session.commit()
    print(f"seeded {len(specs)} funnel users")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dictably.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_admin = sub.add_parser("set-admin", help="Promote user to role=admin")
    p_admin.add_argument("email")

    p_user = sub.add_parser("set-user", help="Demote user to role=user")
    p_user.add_argument("email")

    sub.add_parser("seed-funnel", help="Seed cohort funnel events for admin screenshots")

    args = parser.parse_args(argv)
    if args.cmd == "set-admin":
        return asyncio.run(_set_role(args.email, "admin"))
    if args.cmd == "set-user":
        return asyncio.run(_set_role(args.email, "user"))
    if args.cmd == "seed-funnel":
        return asyncio.run(_seed_funnel())
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
