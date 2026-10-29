"""Multi-file meeting upload: each file = one speaker (T-035b / Zoom)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import Media, MediaStatus, User
from dictably.domain.media import (
    MAX_DURATION_MS,
    MAX_UPLOAD_BYTES,
    ProbeFn,
    ProbeResult,
    assert_allowed_extension,
    probe_file,
    sanitize_filename,
)
from dictably.domain.zoom_names import speaker_name_from_filename
from dictably.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)

MAX_BUNDLE_FILES = 12


async def upload_meeting_bundle(
    session: AsyncSession,
    storage: StorageProvider,
    *,
    user: User,
    files: Sequence[tuple[str | None, str | None, AsyncIterator[bytes]]],
    language: str | None = None,
    vocabulary: list[str] | None = None,
    soft_probe_missing: bool = False,
    probe: ProbeFn | None = None,
) -> Media:
    """Create one Media with N track originals; speaker names from filenames."""
    if len(files) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Meeting bundle needs at least 2 files",
        )
    if len(files) > MAX_BUNDLE_FILES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {MAX_BUNDLE_FILES} files per meeting",
        )

    media = Media(
        user_id=user.id,
        filename="Meeting",
        mime=files[0][1],
        status=MediaStatus.uploading,
        storage_keys={},
        language=(language.strip()[:16] if language and language.strip() else None),
        vocabulary=list(vocabulary or []),
        speakers_expected=len(files),
        asr_meta={"multi_file": True, "tracks": []},
    )
    session.add(media)
    await session.flush()

    tracks_meta: list[dict[str, Any]] = []
    total_size = 0
    max_duration: int | None = None
    keys: dict[str, Any] = {"tracks": []}

    try:
        for i, (raw_name, content_type, chunks) in enumerate(files):
            safe = sanitize_filename(raw_name)
            ext = assert_allowed_extension(safe)
            key = f"u/{user.id}/{media.id}/tracks/{i}{ext}"
            size = await storage.put_stream(key, chunks, max_bytes=MAX_UPLOAD_BYTES)
            if size == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Empty file: {safe}",
                )
            path = await storage.get_path(key)

            def _run_probe(p=path) -> ProbeResult:
                if probe is not None:
                    return probe(p)
                return probe_file(p, soft_missing=soft_probe_missing)

            result = await asyncio.to_thread(_run_probe)
            if result.error == "ffprobe_missing" and not result.ok:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Processing is unavailable",
                )
            if not result.ok:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Not a valid audio or video file: {safe}",
                )
            if result.duration_ms is not None and result.duration_ms > MAX_DURATION_MS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Recording longer than 3 hours",
                )
            total_size += size
            if total_size > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Together over 500 MB",
                )
            if result.duration_ms is not None:
                max_duration = max(max_duration or 0, result.duration_ms)
            speaker = speaker_name_from_filename(safe)
            label = _label_for_index(i)
            tracks_meta.append(
                {
                    "index": i,
                    "key": key,
                    "filename": safe,
                    "speaker_name": speaker,
                    "label": label,
                    "duration_ms": result.duration_ms,
                    "mime": content_type,
                }
            )
            keys["tracks"].append(key)
    except HTTPException:
        for t in tracks_meta:
            try:
                await storage.delete(t["key"])
            except Exception:  # noqa: BLE001
                logger.exception("cleanup track %s", t.get("key"))
        await session.delete(media)
        await session.commit()
        raise
    except Exception:
        for t in tracks_meta:
            try:
                await storage.delete(t["key"])
            except Exception:  # noqa: BLE001
                logger.exception("cleanup track %s", t.get("key"))
        await session.delete(media)
        await session.commit()
        raise

    keys["original"] = tracks_meta[0]["key"]
    media.size_bytes = total_size
    media.duration_ms = max_duration
    media.storage_keys = keys
    media.asr_meta = {"multi_file": True, "tracks": tracks_meta}
    media.status = MediaStatus.uploaded
    media.error = None
    names = [t["speaker_name"] for t in tracks_meta]
    media.filename = f"Meeting · {' · '.join(names[:4])}"[:200]
    await session.commit()
    await session.refresh(media)
    return media


def _label_for_index(i: int) -> str:
    if i < 26:
        return chr(ord("A") + i)
    return f"S{i + 1}"


def merge_track_transcripts(
    track_results: list[tuple[dict[str, Any], dict[str, Any]]],
) -> dict[str, Any]:
    """Merge per-track ASR (single speaker each) into one timeline at t=0."""
    speakers: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    words: list[dict[str, Any]] = []
    language = None
    provider = "fake"
    model = None
    duration_ms = 0

    for meta, tr in track_results:
        label = str(meta.get("label") or "A")
        display = str(meta.get("speaker_name") or label)
        color = int(meta.get("index") or 0)
        speakers.append(
            {
                "id": label,
                "label": label,
                "display_name": display,
                "color_idx": color,
            }
        )
        language = language or tr.get("language")
        provider = str(tr.get("provider") or provider)
        model = tr.get("model") or model
        track_dur = int(tr.get("duration_ms") or meta.get("duration_ms") or 0)
        duration_ms = max(duration_ms, track_dur)

        for seg in tr.get("segments") or []:
            if not isinstance(seg, dict):
                continue
            segments.append(
                {
                    "id": f"tmp-{label}-{seg.get('id')}",
                    "speaker_id": label,
                    "start_ms": int(seg.get("start_ms") or 0),
                    "end_ms": int(seg.get("end_ms") or 0),
                    "text": str(seg.get("text") or "").strip(),
                }
            )
        for w in tr.get("words") or []:
            if not isinstance(w, dict):
                continue
            words.append(
                {
                    "text": w.get("text"),
                    "start_ms": int(w.get("start_ms") or 0),
                    "end_ms": int(w.get("end_ms") or 0),
                    "speaker_id": label,
                    **(
                        {"confidence": float(w["confidence"])}
                        if w.get("confidence") is not None
                        else {}
                    ),
                }
            )

    segments.sort(key=lambda s: (s["start_ms"], s["end_ms"], s["speaker_id"]))
    words.sort(key=lambda w: (w["start_ms"], w["end_ms"]))
    for i, seg in enumerate(segments, start=1):
        seg["id"] = f"S{i}"

    return {
        "provider": provider,
        "model": model or "multi-file",
        "language": language,
        "duration_ms": duration_ms or None,
        "speakers": speakers,
        "segments": segments,
        "words": words,
        "multi_file": True,
    }


def media_is_multi_file(media: Media) -> bool:
    meta = media.asr_meta or {}
    return bool(meta.get("multi_file") and meta.get("tracks"))
