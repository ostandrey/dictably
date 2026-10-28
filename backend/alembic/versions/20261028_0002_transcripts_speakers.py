"""transcripts and speakers

Revision ID: 20261028_0002
Revises: 20261027_0001
Create Date: 2026-10-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261028_0002"
down_revision: str | None = "20261027_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transcripts",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("language", sa.String(length=16), nullable=True),
        sa.Column("segments", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("words", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media.id"],
            name=op.f("fk_transcripts_media_id_media"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("media_id", name=op.f("pk_transcripts")),
    )
    op.create_table(
        "speakers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=32), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("party", sa.String(length=32), nullable=True),
        sa.Column("color_idx", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media.id"],
            name=op.f("fk_speakers_media_id_media"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_speakers")),
    )
    op.create_index(op.f("ix_speakers_media_id"), "speakers", ["media_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_speakers_media_id"), table_name="speakers")
    op.drop_table("speakers")
    op.drop_table("transcripts")
