"""Media processing pipeline (T-013/14): ffmpeg → ASR → ready."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import Settings, get_settings
from dictably.db.models import (
    Job,
    JobKind,
    JobStatus,
    Media,
    MediaStatus,
    Speaker,
    Transcript,
)
from dictably.db.session import get_session_factory
from dictably.domain import analysis as analysis_domain
from dictably.domain import ledger as ledger_domain
from dictably.domain.ffmpeg_media import FfmpegError, normalize_to_playback
from dictably.domain.media import MAX_DURATION_MS, probe_file
from dictably.providers.factory import get_asr_fallback, get_asr_provider, get_storage_provider
from dictably.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)

MAX_PROCESS_ATTEMPTS = 3
# Backoff between transient retries (S1): after attempt 1 → 5s, after 2 → 30s.
RETRY_BACKOFF_S = (5.0, 30.0)


class ProcessError(Exception):
    def __init__(
        self,
        message: str,
        *,
        human: str | None = None,
        permanent: bool = False,
    ) -> None:
        self.human = human or message
        self.permanent = permanent
        super().__init__(message)


async def enqueue_or_run_process(
    session: AsyncSession,
    *,
    media_id: UUID,
    settings: Settings | None = None,
) -> Job:
    """Create process_media job and run inline (test/inline) or enqueue to arq."""
    settings = settings or get_settings()
    job = Job(
        media_id=media_id,
        kind=JobKind.process_media,
        status=JobStatus.queued,
        attempts=0,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    if settings.is_test or settings.inline_media_process:
        await run_process_media(media_id=media_id, job_id=job.id)
    else:
        from arq import create_pool

        from dictably.worker.settings import redis_settings

        redis = await create_pool(redis_settings())
        try:
            await redis.enqueue_job(
                "process_media",
                str(media_id),
                str(job.id),
                _job_id=f"process_media:{media_id}",
            )
        finally:
            await redis.aclose()
    return job


async def run_process_media(*, media_id: UUID, job_id: UUID | None = None) -> None:
    """Worker / inline entry: process one media with retries bookkeeping on Job row."""
    settings = get_settings()
    factory = get_session_factory(settings)
    storage = get_storage_provider(settings)

    async with factory() as session:
        media = await session.get(Media, media_id)
        if media is None:
            logger.error("process_media: media %s missing", media_id)
            return

        job: Job | None = None
        if job_id is not None:
            job = await session.get(Job, job_id)
        if job is None:
            result = await session.execute(
                select(Job)
                .where(Job.media_id == media_id, Job.kind == JobKind.process_media)
                .order_by(Job.created_at.desc())
                .limit(1)
            )
            job = result.scalar_one_or_none()
        if job is None:
            job = Job(
                media_id=media_id,
                kind=JobKind.process_media,
                status=JobStatus.queued,
                attempts=0,
            )
            session.add(job)
            await session.flush()

        # Internal retries only (arq max_tries=1); permanent errors fail immediately (S1).
        last_error: str | None = None
        for attempt_idx in range(MAX_PROCESS_ATTEMPTS):
            job.attempts = (job.attempts or 0) + 1
            job.status = JobStatus.running
            job.last_error = None
            media.status = MediaStatus.processing
            media.error = None
            await session.commit()

            reserve_ref = f"media:{media_id}:a{job.attempts}"
            reserved: dict[str, int] = {"seconds": 0}
            permanent = False
            try:
                await _pipeline(
                    session,
                    storage,
                    settings,
                    media=media,
                    reserve_ref=reserve_ref,
                    reserved=reserved,
                )
                job.status = JobStatus.succeeded
                media.status = MediaStatus.ready
                media.error = None
                if reserved["seconds"]:
                    await ledger_domain.commit(
                        session,
                        user_id=media.user_id,
                        seconds=reserved["seconds"],
                        ref=reserve_ref,
                    )
                await session.commit()
                return
            except ProcessError as exc:
                permanent = exc.permanent
                human = exc.human
                last_error = human[:2000]
                logger.exception(
                    "process_media failed for %s (attempt %s, permanent=%s)",
                    media_id,
                    job.attempts,
                    permanent,
                )
                if reserved["seconds"]:
                    await ledger_domain.release(
                        session,
                        user_id=media.user_id,
                        seconds=reserved["seconds"],
                        ref=reserve_ref,
                    )
                job.last_error = last_error
                await session.commit()
            except Exception as exc:  # noqa: BLE001 — transient → retry
                human = getattr(exc, "human", None) or str(exc)
                last_error = human[:2000]
                logger.exception("process_media failed for %s (attempt %s)", media_id, job.attempts)
                if reserved["seconds"]:
                    await ledger_domain.release(
                        session,
                        user_id=media.user_id,
                        seconds=reserved["seconds"],
                        ref=reserve_ref,
                    )
                job.last_error = last_error
                await session.commit()

            if permanent:
                break
            if attempt_idx < MAX_PROCESS_ATTEMPTS - 1:
                delay = RETRY_BACKOFF_S[min(attempt_idx, len(RETRY_BACKOFF_S) - 1)]
                await asyncio.sleep(delay)

        job.status = JobStatus.failed
        media.status = MediaStatus.failed
        media.error = last_error
        await session.commit()


async def _pipeline(
    session: AsyncSession,
    storage: StorageProvider,
    settings: Settings,
    *,
    media: Media,
    reserve_ref: str,
    reserved: dict[str, int],
) -> None:
    keys = dict(media.storage_keys or {})
    original_key = keys.get("original")
    if not original_key:
        raise ProcessError(
            "Missing original file",
            human="Recording file is missing.",
            permanent=True,
        )

    try:
        original_path = await storage.get_path(original_key)
    except FileNotFoundError as exc:
        raise ProcessError(
            "Missing original file",
            human="Recording file is missing.",
            permanent=True,
        ) from exc

    soft = settings.is_test
    probe = await _probe_async(original_path, soft_missing=soft)
    if not probe.ok:
        if probe.error == "ffprobe_missing" and not soft:
            raise ProcessError(
                "ffprobe missing",
                human="Processing is unavailable.",
                permanent=True,
            )
        raise ProcessError(
            "not media",
            human="This file is not a valid audio or video recording.",
            permanent=True,
        )
    duration_ms = probe.duration_ms or media.duration_ms
    if duration_ms is not None and duration_ms > MAX_DURATION_MS:
        raise ProcessError(
            "too long",
            human="Recording longer than 3 hours.",
            permanent=True,
        )
    if duration_ms is not None:
        media.duration_ms = duration_ms

    await ledger_domain.ensure_trial_grant(
        session,
        user_id=media.user_id,
        seconds=settings.trial_seconds,
    )
    seconds = max(1, int((duration_ms or 60_000) / 1000))
    try:
        await ledger_domain.reserve(
            session,
            user_id=media.user_id,
            seconds=seconds,
            ref=reserve_ref,
        )
    except ledger_domain.InsufficientCredits as exc:
        raise ProcessError(
            "quota",
            human="Not enough transcription time left on your account.",
            permanent=True,
        ) from exc
    reserved["seconds"] = seconds
    await session.commit()

    with tempfile.TemporaryDirectory(prefix="dictably-proc-") as tmp:
        tmp_path = Path(tmp)
        try:
            norm = await _normalize_async(original_path, tmp_path, soft_missing=soft)
        except FfmpegError as exc:
            # Timeout → transient; bad convert → permanent (S1).
            timed_out = "timed out" in str(exc).lower()
            raise ProcessError(
                str(exc),
                human="Could not convert this recording. Try another file format.",
                permanent=not timed_out,
            ) from exc

        if norm.duration_ms is not None:
            media.duration_ms = norm.duration_ms
            seconds = max(1, int(norm.duration_ms / 1000))

        playback_key = f"u/{media.user_id}/{media.id}/playback.m4a"
        peaks_key = f"u/{media.user_id}/{media.id}/peaks.json"
        await storage.put_bytes(playback_key, norm.playback_path.read_bytes())
        await storage.put_bytes(peaks_key, norm.peaks_path.read_bytes())
        keys["playback"] = playback_key
        keys["peaks"] = peaks_key

        # Drop original video-heavy blob after we have playback (keep audio originals).
        suffix = Path(original_key).suffix.lower()
        if suffix in {".mp4", ".mov", ".mkv", ".webm"}:
            await storage.delete(original_key)
            keys.pop("original", None)

        media.storage_keys = keys
        media.status = MediaStatus.transcribing
        await session.commit()

        playback_local = await storage.get_path(playback_key)
        # Empty soft stub — still let fake ASR run.
        asr_path = str(playback_local if playback_local.stat().st_size > 0 else original_path)

        transcript = await _transcribe_with_fallback(
            settings,
            audio_path=asr_path,
            language=media.language,
        )

    media.language = transcript.get("language") or media.language
    await _store_transcript(session, media=media, transcript=transcript)
    await session.flush()

    media.status = MediaStatus.analyzing
    await session.commit()
    tr_row = await session.get(Transcript, media.id)
    if tr_row is not None:
        try:
            await analysis_domain.run_and_store(session, media=media, transcript=tr_row)
            await session.flush()
        except Exception as exc:  # noqa: BLE001 — minutes failure must not lose transcript
            logger.exception("analyze failed for %s: %s", media.id, exc)
            # Keep going to ready; UI can regenerate.


async def _probe_async(path: Path, *, soft_missing: bool):
    return await asyncio.to_thread(probe_file, path, soft_missing=soft_missing)


async def _normalize_async(src: Path, dest: Path, *, soft_missing: bool):
    return await asyncio.to_thread(normalize_to_playback, src, dest, soft_missing=soft_missing)


async def _transcribe_with_fallback(
    settings: Settings,
    *,
    audio_path: str,
    language: str | None,
) -> dict:
    primary = get_asr_provider(settings)
    try:
        return await primary.transcribe(audio_path=audio_path, language=language)
    except Exception as primary_exc:  # noqa: BLE001
        logger.warning("primary ASR %s failed: %s", primary.name, primary_exc)
        fallback = get_asr_fallback(settings, exclude=primary.name)
        if fallback is None:
            raise ProcessError(
                str(primary_exc),
                human="Transcription failed. Please try again.",
            ) from primary_exc
        try:
            result = await fallback.transcribe(audio_path=audio_path, language=language)
            result["fallback_from"] = primary.name
            return result
        except Exception as fb_exc:  # noqa: BLE001
            raise ProcessError(
                str(fb_exc),
                human="Transcription failed. Please try again.",
            ) from fb_exc


async def _store_transcript(
    session: AsyncSession,
    *,
    media: Media,
    transcript: dict,
) -> None:
    # Replace speakers
    existing = await session.execute(select(Speaker).where(Speaker.media_id == media.id))
    for row in existing.scalars().all():
        await session.delete(row)

    for i, sp in enumerate(transcript.get("speakers") or []):
        label = str(sp.get("label") or sp.get("id") or f"S{i}")
        session.add(
            Speaker(
                media_id=media.id,
                label=label,
                display_name=sp.get("display_name") or label,
                party=sp.get("party"),
                color_idx=int(sp.get("color_idx") or i),
            )
        )

    row = await session.get(Transcript, media.id)
    if row is None:
        row = Transcript(media_id=media.id, provider=str(transcript.get("provider") or "unknown"))
        session.add(row)
    row.provider = str(transcript.get("provider") or row.provider)
    model = transcript.get("model")
    # Persist fallback audit without a schema change (S4).
    if transcript.get("fallback_from"):
        base = model or row.provider
        model = f"{base}|fallback_from={transcript['fallback_from']}"
    row.model = model
    row.language = transcript.get("language")
    row.segments = list(transcript.get("segments") or [])
    row.words = list(transcript.get("words") or [])
