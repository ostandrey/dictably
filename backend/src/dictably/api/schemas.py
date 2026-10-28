from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserOut(BaseModel):
    id: UUID
    email: str
    name: str | None
    locale: str
    role: str


class AuthConfigOut(BaseModel):
    google: bool
    dev_login: bool


class DevLoginIn(BaseModel):
    email: EmailStr = Field(default="dev@example.com")
    name: str | None = Field(default="Dev User", max_length=200)


class MediaOut(BaseModel):
    id: UUID
    filename: str
    mime: str | None
    size_bytes: int | None
    duration_ms: int | None
    status: str
    created_at: datetime
    error: str | None = None


class MediaListOut(BaseModel):
    items: list[MediaOut] = Field(default_factory=list)


class TranscriptSegmentOut(BaseModel):
    id: str
    speaker_id: str | None = None
    start_ms: int
    end_ms: int
    text: str


class TranscriptOut(BaseModel):
    media_id: UUID
    provider: str
    model: str | None = None
    language: str | None = None
    segments: list[TranscriptSegmentOut] = Field(default_factory=list)
    status: str
