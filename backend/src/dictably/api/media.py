from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.deps import require_user, require_user_csrf
from dictably.api.schemas import MediaListOut, MediaOut
from dictably.core.config import Settings, get_settings
from dictably.db.models import Media, User
from dictably.db.session import get_db
from dictably.domain import media as media_domain
from dictably.providers.factory import get_storage_provider
from dictably.providers.storage.base import StorageProvider

router = APIRouter(tags=["media"])


def get_storage() -> StorageProvider:
    return get_storage_provider()


def reject_huge_upload(request: Request) -> None:
    """S2: read Content-Length before multipart/File() buffering when possible."""
    raw = request.headers.get("content-length")
    if raw and raw.isdigit() and int(raw) > media_domain.HARD_REJECT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File too large",
        )


def _media_out(row: Media) -> MediaOut:
    return MediaOut(
        id=row.id,
        filename=row.filename,
        mime=row.mime,
        size_bytes=row.size_bytes,
        duration_ms=row.duration_ms,
        status=row.status,
        created_at=row.created_at,
        error=row.error,
    )


async def _file_chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while True:
        chunk = await upload.read(media_domain.CHUNK_SIZE)
        if not chunk:
            break
        yield chunk


@router.get("/media", response_model=MediaListOut)
async def list_media(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MediaListOut:
    rows = await media_domain.list_for_user(session, user.id)
    return MediaListOut(items=[_media_out(r) for r in rows])


@router.get("/media/{media_id}", response_model=MediaOut)
async def get_media(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MediaOut:
    row = await media_domain.get_for_user(session, user.id, media_id)
    return _media_out(row)


@router.post("/media", response_model=MediaOut, status_code=201)
async def upload_media(
    _size_guard: Annotated[None, Depends(reject_huge_upload)],
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File(...)],
) -> MediaOut:
    row = await media_domain.upload_recording(
        session,
        storage,
        user=user,
        filename=file.filename,
        content_type=file.content_type,
        chunks=_file_chunks(file),
        soft_probe_missing=settings.is_test,
    )
    return _media_out(row)
