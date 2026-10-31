"""T-038 B6: jobs.dispatched_at + jobs.heartbeat_at for fair-queue stale detection.

Revision ID: 20261030_0010
Revises: 20261030_0009
Create Date: 2026-10-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261030_0010"
down_revision: str | None = "20261030_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jobs_dispatched_at", "jobs", ["dispatched_at"])


def downgrade() -> None:
    op.drop_index("ix_jobs_dispatched_at", table_name="jobs")
    op.drop_column("jobs", "heartbeat_at")
    op.drop_column("jobs", "dispatched_at")
