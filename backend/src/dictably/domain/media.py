"""Media upload / list / ownership (T-012, MVP-0 stream upload)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import subprocess
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Media, MediaStatus, User
from dictably.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 500 * 1024 * 1024
# Reject absurd bodies before Starlette buffers multipart (S2 / TASKS >2 GB).
HARD_REJECT_BYTES = 2 * 1024 * 1024 * 1024
MAX_DURATION_MS = 3 * 60 * 60 * 1000
CHUNK_SIZE = 1024 * 1024

ALLOWED_EXTENSIONS = frozenset(
    {
        ".mp3",
        ".m4a",
        ".wav",
        ".ogg",
        ".oga",
        ".flac",
        ".aac",
        ".mp4",
        ".mov",
        ".webm",
        ".mkv",
    }
)

_SAFE_NAME = re.compile(r"[^\w.\- ()\[\]]+", re.UNICODE)


@dataclass(frozen=True)
class ProbeResult:
    ok: bool
    duration_ms: int | None = None
    error: str | None = None


ProbeFn = Callable[[Path], ProbeResult]


def sanitize_filename(raw: str | None) -> str:
    name = PurePosixPath((raw or "recording").replace("\\", "/")).name.strip()
    if not name or name in {".", ".."}:
        name = "recording"
    name = _SAFE_NAME.sub("_", name)[:200]
    return name or "recording"


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower()


def assert_allowed_extension(filename: str) -> str:
    ext = extension_of(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unsupported file type",
        )
    return ext


def probe_file(path: Path, *, soft_missing: bool = False) -> ProbeResult:
    """Run ffprobe. Missing binary: soft_ok only when soft_missing (ENV=test)."""
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except FileNotFoundError:
        if soft_missing:
            logger.warning("ffprobe not found; test soft-accept without duration")
            return ProbeResult(ok=True, duration_ms=None, error="ffprobe_missing")
        logger.error("ffprobe not found; refusing upload")
        return ProbeResult(ok=False, error="ffprobe_missing")
    except subprocess.TimeoutExpired:
        return ProbeResult(ok=False, error="ffprobe_timeout")

    if completed.returncode != 0:
        return ProbeResult(ok=False, error="not_media")

    try:
        payload = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError:
        return ProbeResult(ok=False, error="not_media")

    streams = payload.get("streams") or []
    has_av = any(s.get("codec_type") in {"audio", "video"} for s in streams)
    if not has_av:
        return ProbeResult(ok=False, error="not_media")

    duration_ms: int | None = None
    fmt = payload.get("format") or {}
    raw_dur = fmt.get("duration")
    if raw_dur is not None:
        try:
            duration_ms = int(float(raw_dur) * 1000)
        except (TypeError, ValueError):
            duration_ms = None
    if duration_ms is None:
        for stream in streams:
            raw = stream.get("duration")
            if raw is None:
                continue
            try:
                duration_ms = int(float(raw) * 1000)
                break
            except (TypeError, ValueError):
                continue

    return ProbeResult(ok=True, duration_ms=duration_ms)


def storage_key_for(user_id: UUID, media_id: UUID, ext: str) -> str:
    return f"u/{user_id}/{media_id}/original{ext}"


async def list_for_user(session: AsyncSession, user_id: UUID) -> list[Media]:
    result = await session.execute(
        select(Media)
        .where(Media.user_id == user_id, Media.status != MediaStatus.deleted)
        .order_by(Media.created_at.desc())
    )
    return list(result.scalars().all())


async def get_for_user(session: AsyncSession, user_id: UUID, media_id: UUID) -> Media:
    media = await session.get(Media, media_id)
    if media is None or media.user_id != user_id or media.status == MediaStatus.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return media


async def upload_recording(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user: User,
    filename: str | None,
    content_type: str | None,
    chunks: AsyncIterator[bytes],
    max_bytes: int = MAX_UPLOAD_BYTES,
    probe: ProbeFn | None = None,
    soft_probe_missing: bool = False,
) -> Media:
    safe_name = sanitize_filename(filename)
    ext = assert_allowed_extension(safe_name)

    media = Media(
        user_id=user.id,
        filename=safe_name,
        mime=content_type,
        status=MediaStatus.uploading,
        storage_keys={},
    )
    session.add(media)
    await session.flush()

    key = storage_key_for(user.id, media.id, ext)
    try:
        size = await storage.put_stream(key, chunks, max_bytes=max_bytes)
    except ValueError as exc:
        if str(exc) == "too_large":
            await _fail_and_cleanup(session, storage, media, key=None)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File too large",
            ) from exc
        await _fail_and_cleanup(session, storage, media, key=None)
        raise

    if size == 0:
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Empty file",
        )

    try:
        path = await storage.get_path(key)
    except FileNotFoundError as exc:
        await _fail_and_cleanup(session, storage, media, key=None)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage write failed",
        ) from exc

    def _run_probe() -> ProbeResult:
        if probe is not None:
            return probe(path)
        return probe_file(path, soft_missing=soft_probe_missing)

    # B2: never block the event loop on ffprobe.
    result = await asyncio.to_thread(_run_probe)

    if result.error == "ffprobe_missing" and not result.ok:
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Processing is unavailable",
        )
    if not result.ok:
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Not a valid audio or video file",
        )
    if result.duration_ms is not None and result.duration_ms > MAX_DURATION_MS:
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Recording longer than 3 hours",
        )

    media.size_bytes = size
    media.duration_ms = result.duration_ms
    media.storage_keys = {"original": key}
    media.status = MediaStatus.uploaded
    media.error = None
    await session.commit()
    await session.refresh(media)
    return media


async def _fail_and_cleanup(
    session: AsyncSession,
    storage: StorageProvider,
    media: Media,
    *,
    key: str | None,
) -> None:
    if key:
        try:
            await storage.delete(key)
        except Exception:  # noqa: BLE001 — best-effort cleanup
            logger.exception("failed to delete storage key %s", key)
    await session.delete(media)
    await session.commit()
