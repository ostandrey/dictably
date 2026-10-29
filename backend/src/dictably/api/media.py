from __future__ import annotations

import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.deps import require_user, require_user_csrf, require_user_csrf_consent
from dictably.api.schemas import (
    AnalysisOut,
    MediaListOut,
    MediaOut,
    SpeakerOut,
    SpeakerPatchIn,
    TranscriptOut,
    TranscriptSegmentOut,
    TranscriptWordOut,
)
from dictably.core.config import Settings, get_settings
from dictably.db.models import Media, Speaker, Transcript, User
from dictably.db.session import get_db
from dictably.domain import analysis as analysis_domain
from dictably.domain import export as export_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain import speakers as speakers_domain
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


def _speaker_out(row: Speaker) -> SpeakerOut:
    return SpeakerOut(
        id=row.id,
        label=row.label,
        display_name=row.display_name,
        party=row.party,
        color_idx=row.color_idx,
    )


async def _media_out(session: AsyncSession, row: Media) -> MediaOut:
    count = await speakers_domain.count_for_media(session, row.id)
    return MediaOut(
        id=row.id,
        filename=row.filename,
        mime=row.mime,
        size_bytes=row.size_bytes,
        duration_ms=row.duration_ms,
        status=row.status,
        created_at=row.created_at,
        error=row.error,
        language=row.language,
        speaker_count=count,
    )


async def _file_chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while True:
        chunk = await upload.read(media_domain.CHUNK_SIZE)
        if not chunk:
            break
        yield chunk


def _audio_key(media: Media) -> str | None:
    keys = dict(media.storage_keys or {})
    return keys.get("playback") or keys.get("original")


def _peaks_key(media: Media) -> str | None:
    return (media.storage_keys or {}).get("peaks")


@router.get("/media", response_model=MediaListOut)
async def list_media(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MediaListOut:
    rows = await media_domain.list_for_user(session, user.id)
    items = [await _media_out(session, r) for r in rows]
    return MediaListOut(items=items)


@router.get("/media/{media_id}", response_model=MediaOut)
async def get_media(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MediaOut:
    row = await media_domain.get_for_user(session, user.id, media_id)
    return await _media_out(session, row)


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: UUID,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> None:
    await media_domain.delete_for_user(
        session,
        storage,
        user_id=user.id,
        media_id=media_id,
    )


@router.get("/media/{media_id}/transcript", response_model=TranscriptOut)
async def get_transcript(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TranscriptOut:
    media = await media_domain.get_for_user(session, user.id, media_id)
    row = await session.get(Transcript, media.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    segments = [
        TranscriptSegmentOut(
            id=str(s.get("id") or ""),
            speaker_id=s.get("speaker_id"),
            start_ms=int(s.get("start_ms") or 0),
            end_ms=int(s.get("end_ms") or 0),
            text=str(s.get("text") or ""),
        )
        for s in (row.segments or [])
        if isinstance(s, dict)
    ]
    words = [
        TranscriptWordOut(
            text=str(w.get("text") or ""),
            start_ms=int(w.get("start_ms") or w.get("start") or 0),
            end_ms=int(w.get("end_ms") or w.get("end") or 0),
            speaker_id=w.get("speaker_id") or w.get("speaker"),
        )
        for w in (row.words or [])
        if isinstance(w, dict)
    ]
    speaker_rows = await speakers_domain.list_for_media(session, media.id)
    return TranscriptOut(
        media_id=media.id,
        provider=row.provider,
        model=row.model,
        language=row.language or media.language,
        segments=segments,
        words=words,
        speakers=[_speaker_out(s) for s in speaker_rows],
        status=media.status,
    )


@router.get("/media/{media_id}/analysis", response_model=AnalysisOut)
async def get_analysis(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AnalysisOut:
    media = await media_domain.get_for_user(session, user.id, media_id)
    row = await analysis_domain.get_latest(session, media.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    payload = await analysis_domain.to_out_payload(session, row)
    return AnalysisOut.model_validate(payload)


@router.post("/media/{media_id}/analysis", response_model=AnalysisOut)
async def regenerate_analysis(
    media_id: UUID,
    user: Annotated[User, Depends(require_user_csrf_consent)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AnalysisOut:
    try:
        row = await analysis_domain.regenerate_for_user(session, user_id=user.id, media_id=media_id)
    except analysis_domain.AnalysisError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    payload = await analysis_domain.to_out_payload(session, row)
    return AnalysisOut.model_validate(payload)


@router.get("/media/{media_id}/speakers", response_model=list[SpeakerOut])
async def list_speakers(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[SpeakerOut]:
    await media_domain.get_for_user(session, user.id, media_id)
    rows = await speakers_domain.list_for_media(session, media_id)
    return [_speaker_out(s) for s in rows]


@router.patch("/media/{media_id}/speakers/{speaker_id}", response_model=SpeakerOut)
async def patch_speaker(
    media_id: UUID,
    speaker_id: UUID,
    body: SpeakerPatchIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SpeakerOut:
    await media_domain.get_for_user(session, user.id, media_id)
    fields = body.model_fields_set
    row = await speakers_domain.patch_speaker(
        session,
        media_id=media_id,
        speaker_id=speaker_id,
        display_name=body.display_name,
        party=body.party,
        set_display_name="display_name" in fields,
        set_party="party" in fields,
    )
    await session.commit()
    return _speaker_out(row)


@router.get("/media/{media_id}/audio")
async def get_audio(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> FileResponse:
    media = await media_domain.get_for_user(session, user.id, media_id)
    key = _audio_key(media)
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    try:
        path = await storage.get_path(key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found") from exc
    media_type = (
        "audio/mp4" if path.suffix.lower() in {".m4a", ".mp4"} else "application/octet-stream"
    )
    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
        content_disposition_type="inline",
    )


@router.get("/media/{media_id}/export")
async def export_media(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    kind: Annotated[str, Query(description="minutes | transcript")],
    format: Annotated[str, Query(alias="format", description="docx|pdf|md|txt|srt|vtt")],
) -> Response:
    """Download minutes or transcript export (T-017). Foreign media → 404."""
    file = await export_domain.build_export(
        session,
        user,
        media_id,
        kind=kind,
        fmt=format,
        public_app_url=settings.public_app_url,
    )
    # RFC 5987 filename* for non-ASCII stems; ASCII fallback for old agents.
    ascii_name = file.filename.encode("ascii", "ignore").decode("ascii") or "export"
    headers = {
        "Content-Disposition": (
            f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file.filename)}"
        ),
        "Cache-Control": "no-store",
    }
    return Response(content=file.body, media_type=file.media_type, headers=headers)


@router.get("/media/{media_id}/peaks")
async def get_peaks(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> list[float]:
    media = await media_domain.get_for_user(session, user.id, media_id)
    key = _peaks_key(media)
    if not key:
        return []
    try:
        path: Path = await storage.get_path(key)
    except FileNotFoundError:
        return []
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, list):
        return [float(x) for x in data]
    if isinstance(data, dict) and isinstance(data.get("peaks"), list):
        return [float(x) for x in data["peaks"]]
    return []


@router.post("/media", response_model=MediaOut, status_code=201)
async def upload_media(
    _size_guard: Annotated[None, Depends(reject_huge_upload)],
    user: Annotated[User, Depends(require_user_csrf_consent)],
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
    media_id = row.id
    await process_domain.enqueue_or_run_process(session, media_id=media_id, settings=settings)
    # Reload after inline processing (separate session in worker path).
    session.expire_all()
    refreshed = await session.get(Media, media_id)
    return await _media_out(session, refreshed or row)
