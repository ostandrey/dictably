"""Opaque cursor pagination helpers (T-039)."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status


@dataclass(frozen=True, slots=True)
class TimeIdCursor:
    created_at: datetime
    id: UUID


def encode_time_id_cursor(created_at: datetime, row_id: UUID) -> str:
    payload = {
        "t": created_at.isoformat(),
        "i": str(row_id),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_time_id_cursor(raw: str) -> TimeIdCursor:
    try:
        pad = "=" * (-len(raw) % 4)
        data = json.loads(base64.urlsafe_b64decode(raw + pad).decode("utf-8"))
        created_at = datetime.fromisoformat(str(data["t"]))
        row_id = UUID(str(data["i"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        ) from exc
    return TimeIdCursor(created_at=created_at, id=row_id)


def clamp_limit(raw: int | None, *, default: int, maximum: int) -> int:
    if raw is None:
        return default
    return max(1, min(int(raw), maximum))
