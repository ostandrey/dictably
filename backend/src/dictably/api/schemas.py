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
    balance_seconds: int = 0


class SpeakerOut(BaseModel):
    id: UUID
    label: str
    display_name: str | None = None
    party: str | None = None
    color_idx: int = 0


class SpeakerPatchIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)
    party: str | None = Field(default=None, max_length=32)


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
    language: str | None = None
    speaker_count: int = 0


class MediaListOut(BaseModel):
    items: list[MediaOut] = Field(default_factory=list)


class TranscriptSegmentOut(BaseModel):
    id: str
    speaker_id: str | None = None
    start_ms: int
    end_ms: int
    text: str


class TranscriptWordOut(BaseModel):
    text: str
    start_ms: int
    end_ms: int
    speaker_id: str | None = None


class TranscriptOut(BaseModel):
    media_id: UUID
    provider: str
    model: str | None = None
    language: str | None = None
    segments: list[TranscriptSegmentOut] = Field(default_factory=list)
    words: list[TranscriptWordOut] = Field(default_factory=list)
    speakers: list[SpeakerOut] = Field(default_factory=list)
    status: str
