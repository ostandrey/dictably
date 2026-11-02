"""T-040: soft-delete columns deleted_at + status_before_delete.

Revision ID: 20261103_0015
Revises: 20261102_0014
Create Date: 2026-11-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261103_0015"
down_revision = "20261102_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "media",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "media",
        sa.Column("status_before_delete", sa.String(length=32), nullable=True),
    )
    op.create_index(
        "ix_media_deleted_at",
        "media",
        ["deleted_at"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_media_deleted_at", table_name="media")
    op.drop_column("media", "status_before_delete")
    op.drop_column("media", "deleted_at")
