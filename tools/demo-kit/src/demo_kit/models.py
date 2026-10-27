from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class Word(BaseModel):
    w: str
    s: int  # start_ms
    e: int  # end_ms


class Segment(BaseModel):
    id: str
    speaker: str
    start_ms: int
    end_ms: int
    text: str
    words: list[Word] = Field(default_factory=list)

    @field_validator("end_ms")
    @classmethod
    def end_after_start(cls, v: int, info) -> int:
        start = info.data.get("start_ms")
        if start is not None and v < start:
            raise ValueError("end_ms must be >= start_ms")
        return v


class Speaker(BaseModel):
    id: str


class Transcript(BaseModel):
    language: str
    duration_ms: int
    speakers: list[Speaker]
    segments: list[Segment]
    # Optional ISO date for HTML header (S6)
    recorded_at: str | None = None


class Party(BaseModel):
    id: str
    label: str


class Participant(BaseModel):
    speaker: str
    suggested_name: str | None = None
    suggested_role: str | None = None
    party_id: str | None = None


class Point(BaseModel):
    text: str
    segment_ids: list[str] = Field(min_length=1)


class Agreement(BaseModel):
    party_id: str
    text: str
    segment_ids: list[str] = Field(min_length=1)


class Task(BaseModel):
    party_id: str
    text: str
    segment_ids: list[str] = Field(min_length=1)
    owner_speaker: str | None = None
    due_text: str | None = None


class Minutes(BaseModel):
    language: str
    title: str
    parties: list[Party]
    participants: list[Participant]
    summary: list[Point]
    decisions: list[Point] = Field(default_factory=list)
    agreements: list[Agreement] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    deadlines_and_facts: list[Point] = Field(default_factory=list)
    open_questions: list[Point] = Field(default_factory=list)
