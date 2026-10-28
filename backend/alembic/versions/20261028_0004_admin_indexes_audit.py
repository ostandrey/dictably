"""Admin indexes + audit_log (T-019).

Revision ID: 20261028_0004
Revises: 20261028_0003
Create Date: 2026-10-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261028_0004"
down_revision: str | None = "20261028_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)

    op.drop_index("ix_media_user_id", table_name="media")
    op.create_index(
        "ix_media_user_id_created_at",
        "media",
        ["user_id", "created_at"],
        unique=False,
        postgresql_ops={"created_at": "DESC"},
    )

    op.drop_index("ix_analyses_media_id", table_name="analyses")
    op.create_index(
        "ix_analyses_media_id_created_at",
        "analyses",
        ["media_id", "created_at"],
        unique=False,
        postgresql_ops={"created_at": "DESC"},
    )

    op.create_index(
        "ix_jobs_status_created_at",
        "jobs",
        ["status", "created_at"],
        unique=False,
        postgresql_ops={"created_at": "DESC"},
    )

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target", sa.String(length=256), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"], unique=False)
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_log_user_id", table_name="audit_log")
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
    op.drop_table("audit_log")

    op.drop_index("ix_jobs_status_created_at", table_name="jobs")

    op.drop_index("ix_analyses_media_id_created_at", table_name="analyses")
    op.create_index("ix_analyses_media_id", "analyses", ["media_id"], unique=False)

    op.drop_index("ix_media_user_id_created_at", table_name="media")
    op.create_index("ix_media_user_id", "media", ["user_id"], unique=False)

    op.drop_index("ix_sessions_user_id", table_name="sessions")
