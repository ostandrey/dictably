"""T-041 Round 2: media.title_source so regen does not wipe user titles.

Revision ID: 20261102_0013
Revises: 20261102_0012
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261102_0013"
down_revision: str | None = "20261102_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "media",
        sa.Column(
            "title_source",
            sa.String(length=16),
            nullable=False,
            server_default="llm",
        ),
    )


def downgrade() -> None:
    op.drop_column("media", "title_source")
