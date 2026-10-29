from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserOut(BaseModel):
    id: UUID
    email: str
    name: str | None
    locale: str
    role: str
    balance_seconds: int = 0
    timezone: str | None = None
    needs_consent: bool = False
    needs_onboarding: bool = False
    marketing_opt_in: bool = False
    terms_version: str | None = None
    consent_terms_at: datetime | None = None
    onboarding_completed_at: datetime | None = None
    onboarding_skipped_at: datetime | None = None
    preferred_minutes_template: str = "default"


class ConsentIn(BaseModel):
    marketing_opt_in: bool = False
    timezone: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=16)
    signup_utm: dict[str, str] | None = None
    signup_referrer: str | None = Field(default=None, max_length=512)


class OnboardingIn(BaseModel):
    skipped: bool = False
    use_cases: list[str] = Field(default_factory=list, max_length=5)
    meeting_locale: str | None = Field(default=None, max_length=16)


class SpeakerOut(BaseModel):
    id: UUID
    label: str
    display_name: str | None = None
    party: str | None = None
    color_idx: int = 0


class SpeakerPatchIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)
    party: str | None = Field(default=None, max_length=32)


class SpeakersMergeIn(BaseModel):
    keep_id: UUID
    merge_ids: list[UUID] = Field(min_length=1, max_length=32)


class SegmentSpeakerIn(BaseModel):
    speaker_id: UUID


class WordEditIn(BaseModel):
    word_index: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=200)


class MediaPatchIn(BaseModel):
    meeting_date: date | None = None
    vocabulary: list[str] | None = Field(default=None, max_length=200)
    transcript_mode: str | None = Field(default=None, max_length=16)
    language: str | None = Field(default=None, max_length=16)
    speakers_expected: int | None = Field(default=None, ge=1, le=20)
    minutes_template: str | None = Field(default=None, max_length=64)


class AudioTrackOut(BaseModel):
    index: int
    label: str
    language: str | None = None
    channels: int = 1


class MediaProbeOut(BaseModel):
    audio_tracks: list[AudioTrackOut] = Field(default_factory=list)
    needs_track_choice: bool = False


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
    meeting_date: date | None = None
    speakers_expected: int | None = None
    quality_warning: str | None = None
    vocabulary: list[str] = Field(default_factory=list)
    transcript_mode: str = "clean"
    minutes_template: str = "default"


class MediaListOut(BaseModel):
    items: list[MediaOut] = Field(default_factory=list)


class AnalysisRegenerateIn(BaseModel):
    template: str | None = Field(default=None, max_length=64)


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


class MinutesPartyOut(BaseModel):
    id: str
    label: str


class MinutesPointOut(BaseModel):
    text: str
    segment_ids: list[str] = Field(default_factory=list)
    start_ms: int | None = None
    item_id: str | None = None
    agenda_ref: str | None = None
    quote: str | None = None
    status: str | None = None
    condition: str | None = None
    importance: str | None = None
    verify: str | None = None
    verify_reason: str | None = None


class MinutesAgreementOut(BaseModel):
    party_id: str
    text: str
    segment_ids: list[str] = Field(default_factory=list)
    start_ms: int | None = None
    item_id: str | None = None
    agenda_ref: str | None = None
    quote: str | None = None
    status: str | None = None
    condition: str | None = None
    verify: str | None = None
    verify_reason: str | None = None


class MinutesTaskOut(BaseModel):
    party_id: str
    text: str
    segment_ids: list[str] = Field(default_factory=list)
    owner_speaker: str | None = None
    due_text: str | None = None
    due_date: str | None = None
    start_ms: int | None = None
    item_id: str | None = None
    agenda_ref: str | None = None
    quote: str | None = None
    status: str | None = None
    condition: str | None = None
    verify: str | None = None
    verify_reason: str | None = None
    external: bool = False


class MinutesParticipantOut(BaseModel):
    speaker: str
    suggested_name: str | None = None
    suggested_role: str | None = None
    party_id: str | None = None


class MinutesResultOut(BaseModel):
    language: str = "en"
    title: str = "Minutes"
    template: str = "default"
    parties: list[MinutesPartyOut] = Field(default_factory=list)
    participants: list[MinutesParticipantOut] = Field(default_factory=list)
    summary: list[MinutesPointOut] = Field(default_factory=list)
    agenda: list[MinutesPointOut] = Field(default_factory=list)
    heard: list[MinutesPointOut] = Field(default_factory=list)
    decisions: list[MinutesPointOut] = Field(default_factory=list)
    agreements: list[MinutesAgreementOut] = Field(default_factory=list)
    tasks: list[MinutesTaskOut] = Field(default_factory=list)
    deadlines_and_facts: list[MinutesPointOut] = Field(default_factory=list)
    open_questions: list[MinutesPointOut] = Field(default_factory=list)


class AnalysisOut(BaseModel):
    id: UUID
    media_id: UUID
    template: str = "default"
    provider: str
    model: str | None = None
    created_at: datetime
    regenerations_left: int = 0
    result: MinutesResultOut


class AdminUserOut(BaseModel):
    id: UUID
    email: str
    name: str | None
    role: str
    locale: str
    created_at: datetime
    balance_seconds: int = 0


class AdminUserListOut(BaseModel):
    items: list[AdminUserOut] = Field(default_factory=list)


class AdminMediaOut(BaseModel):
    id: UUID
    user_id: UUID
    owner_email: str
    filename: str
    status: str
    duration_ms: int | None = None
    error: str | None = None
    created_at: datetime


class AdminMediaListOut(BaseModel):
    items: list[AdminMediaOut] = Field(default_factory=list)


class AdminJobOut(BaseModel):
    id: UUID
    media_id: UUID | None
    kind: str
    status: str
    attempts: int
    last_error: str | None = None
    created_at: datetime


class AdminJobListOut(BaseModel):
    items: list[AdminJobOut] = Field(default_factory=list)


class AdminGrantIn(BaseModel):
    hours: float = Field(gt=0, le=1000)


class AdminCostsOut(BaseModel):
    period: str
    since: str
    llm_usd: float = 0
    gpu_usd: float = 0
    api_usd: float = 0
    total_usd: float = 0
