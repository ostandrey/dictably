"""Media upload / list / ownership (T-012, MVP-0 stream upload)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import subprocess
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Media, MediaStatus, User
from dictably.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)

# Soft-delete undo window (T-040 B1); hard purge via cron after this.
SOFT_DELETE_SECONDS = 30

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
        ".opus",
        ".amr",
        ".wma",
        ".mp4",
        ".mov",
        ".webm",
        ".mkv",
        ".3gp",
        ".m4v",
        ".avi",
    }
)

# ffprobe format.format_name values we accept (T-013/14 B1). Multi-name
# entries match ffprobe's combined labels; single tokens cover aliases.
ALLOWED_FORMAT_NAMES = frozenset(
    {
        "mp3",
        "mov,mp4,m4a,3gp,3g2,mj2",
        "matroska,webm",
        "wav",
        "ogg",
        "opus",
        "flac",
        "aac",
        "amr",
        "asf",
        "avi",
    }
)
_ALLOWED_FORMAT_TOKENS = frozenset(
    token for name in ALLOWED_FORMAT_NAMES for token in name.split(",") if token
)

_SAFE_NAME = re.compile(r"[^\w.\- ()\[\]]+", re.UNICODE)


@dataclass(frozen=True)
class ProbeResult:
    ok: bool
    duration_ms: int | None = None
    error: str | None = None
    format_name: str | None = None


ProbeFn = Callable[[Path], ProbeResult]


def format_name_allowed(format_name: str | None) -> bool:
    """True if ffprobe format_name is on the media whitelist (B1)."""
    if not format_name:
        return False
    name = format_name.strip().lower()
    if name in ALLOWED_FORMAT_NAMES:
        return True
    tokens = {t.strip() for t in name.split(",") if t.strip()}
    return bool(tokens) and tokens.issubset(_ALLOWED_FORMAT_TOKENS)


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
                "-protocol_whitelist",
                "file",
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

    fmt = payload.get("format") or {}
    format_name = fmt.get("format_name")
    if isinstance(format_name, str):
        format_name = format_name.strip()
    else:
        format_name = None
    if not format_name_allowed(format_name):
        return ProbeResult(ok=False, error="not_media", format_name=format_name)

    duration_ms: int | None = None
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

    return ProbeResult(ok=True, duration_ms=duration_ms, format_name=format_name)


def storage_key_for(user_id: UUID, media_id: UUID, ext: str) -> str:
    return f"u/{user_id}/{media_id}/original{ext}"


async def list_for_user(session: AsyncSession, user_id: UUID) -> list[Media]:
    result = await session.execute(
        select(Media)
        .where(Media.user_id == user_id, Media.status != MediaStatus.deleted)
        .order_by(Media.created_at.desc(), Media.id.desc())
    )
    return list(result.scalars().all())


async def list_page_for_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    limit: int,
    cursor: str | None = None,
    q: str | None = None,
) -> tuple[list[Media], str | None]:
    """Cursor page of recordings (created_at desc, id desc). T-039."""
    from dictably.domain.cursor_page import (
        clamp_limit,
        decode_time_id_cursor,
        encode_time_id_cursor,
    )

    page_size = clamp_limit(limit, default=20, maximum=50)
    stmt = select(Media).where(
        Media.user_id == user_id,
        Media.status != MediaStatus.deleted,
    )
    needle = (q or "").strip()
    if needle:
        # Escape LIKE metacharacters; pg_trgm gin supports ILIKE on filename.
        # Title uses the same ILIKE (MVP; no separate gin — T-041 N3).
        from sqlalchemy import or_

        safe = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{safe}%"
        stmt = stmt.where(
            or_(
                Media.filename.ilike(pattern, escape="\\"),
                Media.title.ilike(pattern, escape="\\"),
            )
        )
    if cursor:
        c = decode_time_id_cursor(cursor)
        stmt = stmt.where(
            (Media.created_at < c.created_at)
            | ((Media.created_at == c.created_at) & (Media.id < c.id))
        )
    stmt = stmt.order_by(Media.created_at.desc(), Media.id.desc()).limit(page_size + 1)
    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor: str | None = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        last = rows[-1]
        next_cursor = encode_time_id_cursor(last.created_at, last.id)
    return rows, next_cursor


async def status_for_user_ids(
    session: AsyncSession,
    user_id: UUID,
    media_ids: list[UUID],
) -> list[Media]:
    """Owned media rows for status polling (T-039). Max 20 ids."""
    if not media_ids:
        return []
    ids = media_ids[:20]
    result = await session.execute(
        select(Media).where(
            Media.user_id == user_id,
            Media.id.in_(ids),
            Media.status != MediaStatus.deleted,
        )
    )
    return list(result.scalars().all())


async def get_for_user(session: AsyncSession, user_id: UUID, media_id: UUID) -> Media:
    media = await session.get(Media, media_id)
    if media is None or media.user_id != user_id or media.status == MediaStatus.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return media


_BUSY_STATUSES = frozenset(
    {
        MediaStatus.queued,
        MediaStatus.processing,
        MediaStatus.transcribing,
        MediaStatus.analyzing,
    }
)

DELETE_BUSY_DETAIL = "Wait until processing finishes"


async def delete_for_user(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user_id: UUID,
    media_id: UUID,
) -> None:
    """Soft-delete: hide from list/audio immediately; hard purge after 30s (T-040 B1)."""
    del storage  # files kept until purge_soft_deleted
    media = await get_for_user(session, user_id, media_id)
    if media.status in _BUSY_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=DELETE_BUSY_DETAIL,
        )
    if media.status == MediaStatus.deleted:
        return
    media.status_before_delete = media.status
    media.status = MediaStatus.deleted
    media.deleted_at = datetime.now(UTC)
    await session.commit()


async def restore_for_user(
    session: AsyncSession,
    *,
    user_id: UUID,
    media_id: UUID,
) -> Media:
    """Undo soft-delete within SOFT_DELETE_SECONDS; else 409."""
    media = await session.get(Media, media_id)
    if media is None or media.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if media.status != MediaStatus.deleted or media.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Not deleted",
        )
    age = datetime.now(UTC) - media.deleted_at
    if age > timedelta(seconds=SOFT_DELETE_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Restore window expired",
        )
    prev = (media.status_before_delete or MediaStatus.ready).strip() or MediaStatus.ready
    media.status = prev
    media.deleted_at = None
    media.status_before_delete = None
    await session.commit()
    await session.refresh(media)
    return media


async def _hard_delete_media(
    session: AsyncSession,
    storage: StorageProvider,
    media: Media,
) -> None:
    """Remove storage objects + DB row (cascade children)."""
    keys = [str(v) for v in (media.storage_keys or {}).values() if v]
    for key in keys:
        try:
            await storage.delete(key)
        except Exception:  # noqa: BLE001
            logger.exception("failed to delete storage key %s on media %s", key, media.id)
    await session.execute(delete(Media).where(Media.id == media.id))


async def purge_soft_deleted(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    older_than_seconds: int = SOFT_DELETE_SECONDS,
) -> int:
    """Hard-delete soft-deleted rows past the undo window. Returns count purged."""
    cutoff = datetime.now(UTC) - timedelta(seconds=older_than_seconds)
    result = await session.execute(
        select(Media).where(
            Media.status == MediaStatus.deleted,
            Media.deleted_at.is_not(None),
            Media.deleted_at < cutoff,
        )
    )
    rows = list(result.scalars().all())
    for media in rows:
        await _hard_delete_media(session, storage, media)
    if rows:
        await session.commit()
    return len(rows)


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
    from dictably.domain import analytics as analytics_domain

    await analytics_domain.track(
        session,
        name=analytics_domain.EVENT_UPLOADED,
        user_id=media.user_id,
        media_id=media.id,
    )
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


# Multipart for objects larger than this (T-038).
MULTIPART_THRESHOLD = 100 * 1024 * 1024
MULTIPART_PART_SIZE = 16 * 1024 * 1024
MAX_UPLOADING_PER_USER = 10
ABANDON_UPLOAD_HOURS = 24


async def create_upload_intent(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user: User,
    filename: str | None,
    content_type: str | None,
    size_bytes: int | None = None,
) -> dict:
    """Create Media row + presigned PUT (or multipart) for direct-to-R2 upload."""
    from dictably.providers.storage.s3 import S3StorageProvider

    if not isinstance(storage, S3StorageProvider):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Direct upload requires STORAGE_PROVIDER=r2 or s3",
        )
    safe_name = sanitize_filename(filename)
    ext = assert_allowed_extension(safe_name)
    if size_bytes is None or size_bytes <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="size_bytes required",
        )
    if size_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File too large",
        )

    # S5: cap unfinished direct uploads per user.
    uploading_n = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Media)
                .where(Media.user_id == user.id, Media.status == MediaStatus.uploading)
            )
        ).scalar_one()
        or 0
    )
    if uploading_n >= MAX_UPLOADING_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Too many unfinished uploads",
        )

    media = Media(
        user_id=user.id,
        filename=safe_name,
        mime=content_type,
        status=MediaStatus.uploading,
        size_bytes=size_bytes,
        storage_keys={},
    )
    session.add(media)
    await session.flush()
    key = storage_key_for(user.id, media.id, ext)
    keys: dict = {"original": key, "declared_size": size_bytes}
    media.storage_keys = keys
    await session.commit()
    await session.refresh(media)

    size = size_bytes
    if size > MULTIPART_THRESHOLD:
        upload_id = await asyncio.to_thread(
            storage.create_multipart_upload, key, content_type=content_type
        )
        keys["upload_id"] = upload_id
        media.storage_keys = keys
        await session.commit()
        n_parts = max(1, (size + MULTIPART_PART_SIZE - 1) // MULTIPART_PART_SIZE)
        # Cap absurd part counts if declared size were wrong (still enforced on complete).
        if n_parts > 10_000:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File too large",
            )

        async def _part(i: int) -> dict:
            url = await asyncio.to_thread(
                storage.presign_upload_part,
                key,
                upload_id=upload_id,
                part_number=i,
            )
            return {"part_number": i, "url": url}

        parts = list(await asyncio.gather(*[_part(i) for i in range(1, n_parts + 1)]))
        return {
            "media_id": str(media.id),
            "key": key,
            "mode": "multipart",
            "upload_id": upload_id,
            "part_size": MULTIPART_PART_SIZE,
            "parts": parts,
        }

    url = await asyncio.to_thread(
        storage.presign_put,
        key,
        content_type=content_type,
        content_length=size,
    )
    headers: dict[str, str] = {"Content-Length": str(size)}
    if content_type:
        headers["Content-Type"] = content_type
    return {
        "media_id": str(media.id),
        "key": key,
        "mode": "put",
        "url": url,
        "headers": headers,
    }


async def complete_direct_upload(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user: User,
    media_id: UUID,
    multipart_parts: list[dict] | None = None,
    upload_id: str | None = None,
    soft_probe_missing: bool = False,
) -> Media:
    """HEAD-only confirm object in storage; format/duration checked by worker (B3)."""
    _ = soft_probe_missing  # probe moved to worker pipeline
    from dictably.providers.storage.s3 import S3StorageProvider

    media = await get_for_user(session, user.id, media_id)
    if media.status not in {MediaStatus.uploading, MediaStatus.uploaded}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload already completed",
        )
    keys = dict(media.storage_keys or {})
    key = keys.get("original")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Missing storage key",
        )
    declared = keys.get("declared_size")
    if declared is None and media.size_bytes is not None:
        declared = media.size_bytes

    uid = upload_id or keys.get("upload_id")
    if isinstance(storage, S3StorageProvider) and uid and multipart_parts:
        parts = [
            {"ETag": str(p["etag"]).strip('"'), "PartNumber": int(p["part_number"])}
            for p in multipart_parts
        ]
        await asyncio.to_thread(
            storage.complete_multipart_upload,
            key,
            upload_id=str(uid),
            parts=parts,
        )

    exists = await storage.exists(key) if hasattr(storage, "exists") else False
    if not exists:
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Upload not found in storage",
        )
    size = await storage.head_size(key) if hasattr(storage, "head_size") else None
    if size is None or size == 0:
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Empty file",
        )
    # B2: reject oversized or mismatched declared size.
    if size > MAX_UPLOAD_BYTES or (
        declared is not None and int(declared) > 0 and int(size) != int(declared)
    ):
        await _fail_and_cleanup(session, storage, media, key=key)
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File too large",
        )

    keys.pop("upload_id", None)
    media.storage_keys = keys
    media.size_bytes = size
    media.status = MediaStatus.uploaded
    media.error = None
    from dictably.domain import analytics as analytics_domain

    await analytics_domain.track(
        session,
        name=analytics_domain.EVENT_UPLOADED,
        user_id=media.user_id,
        media_id=media.id,
    )
    await session.commit()
    await session.refresh(media)
    return media


async def abort_direct_upload(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user: User,
    media_id: UUID,
) -> None:
    """Abort multipart + delete incomplete upload row (S1/S3)."""
    from dictably.providers.storage.s3 import S3StorageProvider

    media = await get_for_user(session, user.id, media_id)
    if media.status != MediaStatus.uploading:
        return
    keys = dict(media.storage_keys or {})
    key = keys.get("original")
    uid = keys.get("upload_id")
    if isinstance(storage, S3StorageProvider) and key and uid:
        await asyncio.to_thread(storage.abort_multipart_upload, key, upload_id=str(uid))
    await _fail_and_cleanup(session, storage, media, key=key)


async def abandon_stale_uploads(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    older_than_hours: int = ABANDON_UPLOAD_HOURS,
) -> int:
    """S1: uploading older than N hours → abort multipart + delete row."""
    from datetime import UTC, datetime, timedelta

    from dictably.providers.storage.s3 import S3StorageProvider

    cutoff = datetime.now(UTC) - timedelta(hours=max(1, older_than_hours))
    rows = (
        (
            await session.execute(
                select(Media)
                .where(Media.status == MediaStatus.uploading, Media.created_at < cutoff)
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for media in rows:
        keys = dict(media.storage_keys or {})
        key = keys.get("original")
        uid = keys.get("upload_id")
        if isinstance(storage, S3StorageProvider) and key and uid:
            await asyncio.to_thread(storage.abort_multipart_upload, str(key), upload_id=str(uid))
        await _fail_and_cleanup(session, storage, media, key=key if key else None)
        n += 1
    return n


async def purge_expired_originals(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    retention_days: int,
) -> int:
    """Delete original keys older than retention when playback exists. Returns count."""
    if retention_days <= 0:
        return 0
    from datetime import UTC, datetime, timedelta

    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    # N2: only rows that still have an original key; batch of 500.
    rows = (
        (
            await session.execute(
                select(Media)
                .where(
                    Media.status == MediaStatus.ready,
                    Media.created_at < cutoff,
                    Media.storage_keys.has_key("original"),
                )
                .limit(500)
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for media in rows:
        keys = dict(media.storage_keys or {})
        original = keys.get("original")
        if not original or not keys.get("playback"):
            continue
        if keys.get("original_purged"):
            continue
        try:
            await storage.delete(original)
        except Exception:  # noqa: BLE001
            logger.exception("purge original failed for %s", media.id)
            continue
        keys.pop("original", None)
        keys["original_purged"] = True
        media.storage_keys = keys
        n += 1
    if n:
        await session.commit()
    return n
