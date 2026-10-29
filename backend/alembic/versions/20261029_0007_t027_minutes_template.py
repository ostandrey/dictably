"""T-027 media.minutes_template for preferred minutes shape.

Revision ID: 20261029_0007
Revises: 20261029_0006
Create Date: 2026-10-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261029_0007"
down_revision: str | None = "20261029_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "media",
        sa.Column(
            "minutes_template",
            sa.String(length=64),
            nullable=False,
            server_default="default",
        ),
    )


def downgrade() -> None:
    op.drop_column("media", "minutes_template")
