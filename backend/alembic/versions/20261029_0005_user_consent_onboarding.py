"""User consent, onboarding, attribution (T-033).

Revision ID: 20261029_0005
Revises: 20261028_0004
Create Date: 2026-10-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261029_0005"
down_revision: str | None = "20261028_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("timezone", sa.String(length=64), nullable=True))
    op.add_column(
        "users",
        sa.Column("consent_terms_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("users", sa.Column("terms_version", sa.String(length=32), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "marketing_opt_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "signup_utm",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "users",
        sa.Column("signup_referrer", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "onboarding_use_cases",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "users",
        sa.Column("onboarding_meeting_locale", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("onboarding_skipped_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding_skipped_at")
    op.drop_column("users", "onboarding_completed_at")
    op.drop_column("users", "onboarding_meeting_locale")
    op.drop_column("users", "onboarding_use_cases")
    op.drop_column("users", "signup_referrer")
    op.drop_column("users", "signup_utm")
    op.drop_column("users", "marketing_opt_in_at")
    op.drop_column("users", "marketing_opt_in")
    op.drop_column("users", "terms_version")
    op.drop_column("users", "consent_terms_at")
    op.drop_column("users", "timezone")
