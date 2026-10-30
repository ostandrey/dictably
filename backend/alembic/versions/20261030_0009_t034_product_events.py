"""T-034 product_events table for server-side funnel analytics.

Revision ID: 20261030_0009
Revises: 20261030_0008
Create Date: 2026-10-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261030_0009"
down_revision: str | None = "20261030_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column(
            "media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "props",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_product_events_created_at", "product_events", ["created_at"])
    op.create_index("ix_product_events_name_created_at", "product_events", ["name", "created_at"])
    op.create_index("ix_product_events_user_id", "product_events", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_product_events_user_id", table_name="product_events")
    op.drop_index("ix_product_events_name_created_at", table_name="product_events")
    op.drop_index("ix_product_events_created_at", table_name="product_events")
    op.drop_table("product_events")
