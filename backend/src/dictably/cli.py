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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dictably.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_admin = sub.add_parser("set-admin", help="Promote user to role=admin")
    p_admin.add_argument("email")

    p_user = sub.add_parser("set-user", help="Demote user to role=user")
    p_user.add_argument("email")

    args = parser.parse_args(argv)
    if args.cmd == "set-admin":
        return asyncio.run(_set_role(args.email, "admin"))
    if args.cmd == "set-user":
        return asyncio.run(_set_role(args.email, "user"))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
