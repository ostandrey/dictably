"""T-027 preferred_minutes_template on users (onboarding + last choice).

Revision ID: 20261030_0008
Revises: 20261029_0007
Create Date: 2026-10-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261030_0008"
down_revision: str | None = "20261029_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferred_minutes_template",
            sa.String(length=64),
            nullable=False,
            server_default="default",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferred_minutes_template")
