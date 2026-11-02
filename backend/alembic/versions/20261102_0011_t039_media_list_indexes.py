"""T-039: media list cursor index + filename trigram search.

Revision ID: 20261102_0011
Revises: 20261030_0010
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "20261102_0011"
down_revision: str | None = "20261030_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.drop_index("ix_media_user_id_created_at", table_name="media")
    op.create_index(
        "ix_media_user_id_created_at_id",
        "media",
        ["user_id", "created_at", "id"],
        unique=False,
        postgresql_ops={"created_at": "DESC", "id": "DESC"},
    )
    op.create_index(
        "ix_media_filename_trgm",
        "media",
        ["filename"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"filename": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_media_filename_trgm", table_name="media")
    op.drop_index("ix_media_user_id_created_at_id", table_name="media")
    op.create_index(
        "ix_media_user_id_created_at",
        "media",
        ["user_id", "created_at"],
        unique=False,
        postgresql_ops={"created_at": "DESC"},
    )
