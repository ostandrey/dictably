"""T-035 ASR quality fields on media.

Revision ID: 20261029_0006
Revises: 20261029_0005
Create Date: 2026-10-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261029_0006"
down_revision: str | None = "20261029_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("media", sa.Column("meeting_date", sa.Date(), nullable=True))
    op.add_column("media", sa.Column("speakers_expected", sa.Integer(), nullable=True))
    op.add_column("media", sa.Column("quality_warning", sa.Text(), nullable=True))
    op.add_column(
        "media",
        sa.Column(
            "vocabulary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "media",
        sa.Column(
            "transcript_mode",
            sa.String(length=16),
            nullable=False,
            server_default="clean",
        ),
    )
    op.add_column(
        "media",
        sa.Column(
            "asr_meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("media", "asr_meta")
    op.drop_column("media", "transcript_mode")
    op.drop_column("media", "vocabulary")
    op.drop_column("media", "quality_warning")
    op.drop_column("media", "speakers_expected")
    op.drop_column("media", "meeting_date")
