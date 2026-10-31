from __future__ import annotations

import json
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.deps import require_user, require_user_csrf, require_user_csrf_consent
from dictably.api.schemas import (
    AnalysisOut,
    AnalysisRegenerateIn,
    AudioTrackOut,
    FollowUpEmailOut,
    MediaListOut,
    MediaOut,
    MediaPatchIn,
    MediaProbeOut,
    SegmentSpeakerIn,
    SpeakerOut,
    SpeakerPatchIn,
    SpeakersMergeIn,
    TranscriptOut,
    TranscriptSegmentOut,
    TranscriptWordOut,
    UploadCompleteIn,
    UploadIntentIn,
    UploadIntentOut,
    WordEditIn,
)
from dictably.core.config import Settings, get_settings
from dictably.db.models import Media, Speaker, Transcript, User
from dictably.db.session import get_db
from dictably.domain import account as account_domain
from dictably.domain import analysis as analysis_domain
from dictably.domain import export as export_domain
from dictably.domain import media as media_domain
from dictably.domain import meeting_bundle as meeting_bundle_domain
from dictably.domain import process as process_domain
from dictably.domain import speakers as speakers_domain
from dictably.domain import transcript_edit as transcript_edit_domain
from dictably.domain.asr_postprocess import apply_transcript_mode
from dictably.domain.ffmpeg_media import FfmpegError, list_audio_tracks
from dictably.domain.follow_up import draft_follow_up_email
from dictably.domain.minutes_schema import Minutes
from dictably.domain.minutes_templates import normalize_template
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
    vocab = [str(v) for v in (row.vocabulary or [])]
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
        meeting_date=row.meeting_date,
        speakers_expected=row.speakers_expected,
        quality_warning=row.quality_warning,
        vocabulary=vocab,
        transcript_mode=row.transcript_mode or "clean",
        minutes_template=getattr(row, "minutes_template", None) or "default",
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


@router.post("/media/upload-intent", response_model=UploadIntentOut)
async def media_upload_intent(
    body: UploadIntentIn,
    user: Annotated[User, Depends(require_user_csrf_consent)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> UploadIntentOut:
    """Presigned PUT / multipart for direct browser→R2 upload (T-038)."""
    data = await media_domain.create_upload_intent(
        session,
        storage,
        user=user,
        filename=body.filename,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
    )
    return UploadIntentOut.model_validate(data)


@router.post("/media/{media_id}/upload-complete", response_model=MediaOut)
async def media_upload_complete(
    media_id: UUID,
    body: UploadCompleteIn,
    user: Annotated[User, Depends(require_user_csrf_consent)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> MediaOut:
    """HEAD-confirm object in storage; enqueue process (format checked by worker)."""
    row = await media_domain.complete_direct_upload(
        session,
        storage,
        user=user,
        media_id=media_id,
        multipart_parts=body.parts,
        upload_id=body.upload_id,
        soft_probe_missing=settings.is_test,
    )
    if body.language and body.language.strip():
        row.language = body.language.strip()[:16]
    if body.speakers_expected is not None:
        row.speakers_expected = body.speakers_expected
    if body.vocabulary and body.vocabulary.strip():
        terms = [
            t.strip()
            for part in body.vocabulary.replace("\n", ",").split(",")
            for t in [part]
            if t.strip()
        ][:200]
        row.vocabulary = terms
    preferred = getattr(user, "preferred_minutes_template", None) or "default"
    tid = account_domain.remember_minutes_template(
        user, body.minutes_template if body.minutes_template else preferred
    )
    row.minutes_template = tid
    await session.commit()
    # B8: capture id before expire — expire_all so response sees worker-updated status.
    media_id_done = row.id
    await process_domain.enqueue_or_run_process(session, media_id=media_id_done, settings=settings)
    session.expire_all()
    refreshed = await session.get(Media, media_id_done)
    return await _media_out(session, refreshed or row)


@router.post("/media/{media_id}/upload-abort", status_code=status.HTTP_204_NO_CONTENT)
async def media_upload_abort(
    media_id: UUID,
    user: Annotated[User, Depends(require_user_csrf_consent)],
    session: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> Response:
    """Abort incomplete direct upload (S1/S3)."""
    await media_domain.abort_direct_upload(session, storage, user=user, media_id=media_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/media/probe", response_model=MediaProbeOut)
async def probe_media_upload(
    _size_guard: Annotated[None, Depends(reject_huge_upload)],
    user: Annotated[User, Depends(require_user_csrf_consent)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File(...)],
) -> MediaProbeOut:
    """Probe audio tracks before upload (T-035 S3). Does not store the file."""
    _ = user
    suffix = Path(file.filename or "probe.bin").suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while True:
            chunk = await file.read(media_domain.CHUNK_SIZE)
            if not chunk:
                break
            tmp.write(chunk)
    try:
        tracks = list_audio_tracks(tmp_path, soft_missing=settings.is_test)
    except FfmpegError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read audio tracks",
        ) from exc
    finally:
        tmp_path.unlink(missing_ok=True)
    out = [
        AudioTrackOut(
            index=t.index,
            label=t.label,
            language=t.language,
            channels=t.channels,
        )
        for t in tracks
    ]
    return MediaProbeOut(audio_tracks=out, needs_track_choice=len(out) > 1)


@router.get("/media/{media_id}", response_model=MediaOut)
async def get_media(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MediaOut:
    row = await media_domain.get_for_user(session, user.id, media_id)
    return await _media_out(session, row)


@router.patch("/media/{media_id}", response_model=MediaOut)
async def patch_media(
    media_id: UUID,
    body: MediaPatchIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MediaOut:
    row = await media_domain.get_for_user(session, user.id, media_id)
    fields = body.model_fields_set
    if "meeting_date" in fields and body.meeting_date is not None:
        await transcript_edit_domain.set_meeting_date(
            session, media=row, meeting_date=body.meeting_date
        )
    if "vocabulary" in fields and body.vocabulary is not None:
        cleaned = [v.strip() for v in body.vocabulary if v and v.strip()][:200]
        row.vocabulary = cleaned
    if "transcript_mode" in fields and body.transcript_mode is not None:
        mode = body.transcript_mode.strip().lower()
        if mode not in {"clean", "verbatim"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="transcript_mode must be clean or verbatim",
            )
        row.transcript_mode = mode
    if "language" in fields and body.language is not None:
        row.language = body.language.strip() or None
    if "speakers_expected" in fields:
        row.speakers_expected = body.speakers_expected
    if "minutes_template" in fields and body.minutes_template is not None:
        tid = account_domain.remember_minutes_template(user, body.minutes_template)
        row.minutes_template = tid
    await session.commit()
    await session.refresh(row)
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
    raw_segments = [s for s in (row.segments or []) if isinstance(s, dict)]
    display_segments = apply_transcript_mode(raw_segments, mode=media.transcript_mode or "clean")
    segments = [
        TranscriptSegmentOut(
            id=str(s.get("id") or ""),
            speaker_id=s.get("speaker_id"),
            start_ms=int(s.get("start_ms") or 0),
            end_ms=int(s.get("end_ms") or 0),
            text=str(s.get("text") or ""),
        )
        for s in display_segments
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
    from dictably.domain import analytics as analytics_domain

    media = await media_domain.get_for_user(session, user.id, media_id)
    row = await analysis_domain.get_latest(session, media.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await analytics_domain.track_minutes_viewed(
        session,
        user_id=user.id,
        media_id=media.id,
    )
    await session.commit()
    payload = await analysis_domain.to_out_payload(session, row)
    return AnalysisOut.model_validate(payload)


@router.post("/media/{media_id}/analysis", response_model=AnalysisOut)
async def regenerate_analysis(
    media_id: UUID,
    user: Annotated[User, Depends(require_user_csrf_consent)],
    session: Annotated[AsyncSession, Depends(get_db)],
    body: AnalysisRegenerateIn | None = None,
) -> AnalysisOut:
    template = normalize_template(body.template) if body and body.template else None
    try:
        row = await analysis_domain.regenerate_for_user(
            session,
            user_id=user.id,
            media_id=media_id,
            template=template,
        )
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


@router.post("/media/{media_id}/speakers/merge", response_model=list[SpeakerOut])
async def merge_speakers(
    media_id: UUID,
    body: SpeakersMergeIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[SpeakerOut]:
    await media_domain.get_for_user(session, user.id, media_id)
    rows = await speakers_domain.merge_speakers(
        session,
        media_id=media_id,
        keep_id=body.keep_id,
        merge_ids=body.merge_ids,
    )
    await session.commit()
    return [_speaker_out(s) for s in rows]


@router.patch("/media/{media_id}/segments/{segment_id}/speaker", response_model=TranscriptOut)
async def patch_segment_speaker(
    media_id: UUID,
    segment_id: str,
    body: SegmentSpeakerIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TranscriptOut:
    await media_domain.get_for_user(session, user.id, media_id)
    await speakers_domain.reassign_segment_speaker(
        session,
        media_id=media_id,
        segment_id=segment_id,
        speaker_id=body.speaker_id,
    )
    await session.commit()
    return await get_transcript(media_id, user, session)


@router.post(
    "/media/{media_id}/segments/{segment_id}/split-speaker",
    response_model=TranscriptOut,
)
async def split_segment_speaker(
    media_id: UUID,
    segment_id: str,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TranscriptOut:
    await media_domain.get_for_user(session, user.id, media_id)
    await speakers_domain.split_segment_to_new_speaker(
        session, media_id=media_id, segment_id=segment_id
    )
    await session.commit()
    return await get_transcript(media_id, user, session)


@router.patch("/media/{media_id}/words", response_model=TranscriptOut)
async def patch_word(
    media_id: UUID,
    body: WordEditIn,
    user: Annotated[User, Depends(require_user_csrf)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TranscriptOut:
    await media_domain.get_for_user(session, user.id, media_id)
    await transcript_edit_domain.edit_word(
        session,
        media_id=media_id,
        word_index=body.word_index,
        text=body.text,
    )
    await session.commit()
    return await get_transcript(media_id, user, session)


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


@router.get("/media/{media_id}/follow-up", response_model=FollowUpEmailOut)
async def follow_up_email(
    media_id: UUID,
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> FollowUpEmailOut:
    """Draft follow-up email from latest minutes (T-028). No ASR/LLM call."""
    media = await media_domain.get_for_user(session, user.id, media_id)
    row = await analysis_domain.get_latest(session, media.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    speakers = await speakers_domain.list_for_media(session, media.id)
    minutes = Minutes.model_validate(row.result or {})
    draft = draft_follow_up_email(media=media, minutes=minutes, speakers=speakers)
    return FollowUpEmailOut(
        subject=draft.subject,
        body=draft.body,
        language=draft.language,
        weak_skipped=draft.weak_skipped,
        weak_texts=list(draft.weak_texts),
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
    from dictably.domain import analytics as analytics_domain

    file = await export_domain.build_export(
        session,
        user,
        media_id,
        kind=kind,
        fmt=format,
        public_app_url=settings.public_app_url,
    )
    await analytics_domain.track(
        session,
        name=analytics_domain.EVENT_EXPORT_DOWNLOADED,
        user_id=user.id,
        media_id=media_id,
        props={"kind": kind, "format": format},
    )
    await session.commit()
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
    file: Annotated[UploadFile | None, File()] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
    language: Annotated[str | None, Form()] = None,
    speakers_expected: Annotated[int | None, Form()] = None,
    vocabulary: Annotated[str | None, Form()] = None,
    audio_stream_index: Annotated[int | None, Form()] = None,
    meeting_bundle: Annotated[str | None, Form()] = None,
    minutes_template: Annotated[str | None, Form()] = None,
) -> MediaOut:
    """Upload one recording, or several as one Zoom-style meeting (T-035b).

    Form: `file` and/or `files`; `meeting_bundle=1` (or 2+ files) → one media, each file a speaker.
    """
    uploads: list[UploadFile] = []
    if files:
        uploads.extend(files)
    if file is not None:
        uploads.insert(0, file)
    # Dedupe if same object passed twice
    seen: set[int] = set()
    unique: list[UploadFile] = []
    for u in uploads:
        oid = id(u)
        if oid in seen:
            continue
        seen.add(oid)
        unique.append(u)
    uploads = unique
    if not uploads:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="file required",
        )

    want_bundle = (meeting_bundle or "").strip() in {"1", "true", "yes", "on"}
    if want_bundle or len(uploads) >= 2:
        if len(uploads) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Meeting bundle needs at least 2 files",
            )
        vocab_terms: list[str] = []
        if vocabulary and vocabulary.strip():
            vocab_terms = [
                t.strip()
                for part in vocabulary.replace("\n", ",").split(",")
                for t in [part]
                if t.strip()
            ][:200]
        row = await meeting_bundle_domain.upload_meeting_bundle(
            session,
            storage,
            user=user,
            files=[(u.filename, u.content_type, _file_chunks(u)) for u in uploads],
            language=language,
            vocabulary=vocab_terms,
            soft_probe_missing=settings.is_test,
        )
    else:
        one = uploads[0]
        row = await media_domain.upload_recording(
            session,
            storage,
            user=user,
            filename=one.filename,
            content_type=one.content_type,
            chunks=_file_chunks(one),
            soft_probe_missing=settings.is_test,
        )
        if language and language.strip():
            row.language = language.strip()[:16]
        if speakers_expected is not None:
            if speakers_expected < 1 or speakers_expected > 20:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="speakers_expected must be 1–20",
                )
            row.speakers_expected = speakers_expected
        if vocabulary and vocabulary.strip():
            terms = [
                t.strip()
                for part in vocabulary.replace("\n", ",").split(",")
                for t in [part]
                if t.strip()
            ][:200]
            row.vocabulary = terms
        if audio_stream_index is not None:
            if audio_stream_index < 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="audio_stream_index must be ≥ 0",
                )
            meta = dict(row.asr_meta or {})
            meta["audio_stream_index"] = int(audio_stream_index)
            row.asr_meta = meta

    # B2: template from upload form, else user's preferred default.
    preferred = getattr(user, "preferred_minutes_template", None) or "default"
    tid = account_domain.remember_minutes_template(
        user, minutes_template if minutes_template else preferred
    )
    row.minutes_template = tid
    await session.commit()

    media_id = row.id
    await process_domain.enqueue_or_run_process(session, media_id=media_id, settings=settings)
    session.expire_all()
    refreshed = await session.get(Media, media_id)
    return await _media_out(session, refreshed or row)
