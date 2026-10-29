from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dictably.db.base import Base, TimestampMixin, new_uuid


class MediaStatus(StrEnum):
    uploading = "uploading"
    uploaded = "uploaded"
    processing = "processing"
    transcribing = "transcribing"
    analyzing = "analyzing"
    ready = "ready"
    failed = "failed"
    deleted = "deleted"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class JobKind(StrEnum):
    ping = "ping"
    process_media = "process_media"
    transcribe = "transcribe"
    analyze = "analyze"
    cleanup = "cleanup"


class CreditKind(StrEnum):
    grant = "grant"
    reserve = "reserve"
    commit = "commit"
    release = "release"


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_email", "email", unique=True),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200))
    locale: Mapped[str] = mapped_column(String(16), default="en", nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False)
    google_sub: Mapped[str | None] = mapped_column(String(128), unique=True)
    # T-033 — profile extras, consents, first-touch attribution, onboarding
    timezone: Mapped[str | None] = mapped_column(String(64))
    consent_terms_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_version: Mapped[str | None] = mapped_column(String(32))
    marketing_opt_in: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    marketing_opt_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signup_utm: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, insert_default=dict, server_default="{}"
    )
    signup_referrer: Mapped[str | None] = mapped_column(String(512))
    onboarding_use_cases: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, insert_default=list, server_default="[]"
    )
    onboarding_meeting_locale: Mapped[str | None] = mapped_column(String(16))
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    onboarding_skipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list[Session]] = relationship(back_populates="user")
    media: Mapped[list[Media]] = relationship(back_populates="user")


class Session(Base, TimestampMixin):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_token_hash", "token_hash", unique=True),
        Index("ix_sessions_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))

    user: Mapped[User] = relationship(back_populates="sessions")


class Media(Base, TimestampMixin):
    __tablename__ = "media"
    __table_args__ = (Index("ix_media_user_id_created_at", "user_id", text("created_at DESC")),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime: Mapped[str | None] = mapped_column(String(128))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default=MediaStatus.uploading, nullable=False)
    storage_keys: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, insert_default=dict, server_default="{}"
    )
    language: Mapped[str | None] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(Text)
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meeting_date: Mapped[date | None] = mapped_column(Date)
    speakers_expected: Mapped[int | None] = mapped_column(Integer)
    quality_warning: Mapped[str | None] = mapped_column(Text)
    vocabulary: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, insert_default=list, server_default="[]"
    )
    transcript_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="clean", server_default="clean"
    )
    asr_meta: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, insert_default=dict, server_default="{}"
    )

    user: Mapped[User] = relationship(back_populates="media")
    jobs: Mapped[list[Job]] = relationship(back_populates="media")
    transcript: Mapped[Transcript | None] = relationship(back_populates="media")
    speakers: Mapped[list[Speaker]] = relationship(back_populates="media")
    analyses: Mapped[list[Analysis]] = relationship(back_populates="media")


class Transcript(Base, TimestampMixin):
    __tablename__ = "transcripts"

    media_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        primary_key=True,
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str | None] = mapped_column(String(128))
    language: Mapped[str | None] = mapped_column(String(16))
    segments: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, insert_default=list, server_default="[]"
    )
    words: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, insert_default=list, server_default="[]"
    )

    media: Mapped[Media] = relationship(back_populates="transcript")


class Speaker(Base, TimestampMixin):
    __tablename__ = "speakers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    media_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    party: Mapped[str | None] = mapped_column(String(32))
    color_idx: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    media: Mapped[Media] = relationship(back_populates="speakers")


class Analysis(Base, TimestampMixin):
    """LLM minutes for a recording (ARCHITECTURE §6). Latest by created_at wins."""

    __tablename__ = "analyses"
    __table_args__ = (
        Index("ix_analyses_media_id_created_at", "media_id", text("created_at DESC")),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    media_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False
    )
    template: Mapped[str] = mapped_column(String(64), default="default", nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str | None] = mapped_column(String(128))
    result: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, insert_default=dict, server_default="{}"
    )
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(Float)

    media: Mapped[Media] = relationship(back_populates="analyses")


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_created_at", "status", text("created_at DESC")),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    media_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=JobStatus.queued, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    timings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, insert_default=dict, server_default="{}"
    )

    media: Mapped[Media | None] = relationship(back_populates="jobs")


class AuditLog(Base, TimestampMixin):
    """Append-only admin/user action log (ARCHITECTURE §6)."""

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_created_at", "created_at"),
        Index("ix_audit_log_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target: Mapped[str | None] = mapped_column(String(256))
    ip: Mapped[str | None] = mapped_column(String(64))


class CreditLedger(Base, TimestampMixin):
    """Append-only quota ledger (ARCHITECTURE §6)."""

    __tablename__ = "credit_ledger"
    __table_args__ = (
        Index(
            "uq_credit_ledger_user_kind_ref",
            "user_id",
            "kind",
            "ref",
            unique=True,
            postgresql_where=text("ref IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delta_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    ref: Mapped[str | None] = mapped_column(String(128))
