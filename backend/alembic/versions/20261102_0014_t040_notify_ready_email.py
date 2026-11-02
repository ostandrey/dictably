"""T-040: users.notify_ready_email for long-processing ready mail.

Revision ID: 20261102_0014
Revises: 20261102_0013
Create Date: 2026-11-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261102_0014"
down_revision = "20261102_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "notify_ready_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notify_ready_email")
