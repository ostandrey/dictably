from __future__ import annotations

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


class MediaListOut(BaseModel):
    items: list[dict] = Field(default_factory=list)
