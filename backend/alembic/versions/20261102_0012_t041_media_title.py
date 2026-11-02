"""T-041: media.title for human display name + search.

Revision ID: 20261102_0012
Revises: 20261102_0011
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261102_0012"
down_revision: str | None = "20261102_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("media", sa.Column("title", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("media", "title")
