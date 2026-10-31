"""Admin ops monitoring + email alerts (T-038)."""

from __future__ import annotations

import asyncio
import logging
import shutil
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.core.config import Settings, get_settings
from dictably.db.models import Job, JobKind, JobStatus, Media, MediaStatus

logger = logging.getLogger(__name__)

_ALERT_COOLDOWN_S = 30 * 60
_REDIS_ALERT_KEY = "dictably:ops:alert_sent"
_MIN_JOBS_FOR_ERROR_RATE = 5


async def ops_report(
    session: AsyncSession,
    settings: Settings | None = None,
    *,
    send_alerts: bool = False,
) -> dict[str, Any]:
    settings = settings or get_settings()
    since = datetime.now(UTC) - timedelta(hours=24)

    queued = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Job)
                .where(Job.kind == JobKind.process_media, Job.status == JobStatus.queued)
            )
        ).scalar_one()
        or 0
    )
    running = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Job)
                .where(
                    Job.kind == JobKind.process_media,
                    Job.status.in_((JobStatus.running, JobStatus.dispatched)),
                )
            )
        ).scalar_one()
        or 0
    )
    media_queued = int(
        (
            await session.execute(
                select(func.count()).select_from(Media).where(Media.status == MediaStatus.queued)
            )
        ).scalar_one()
        or 0
    )

    succeeded_24h = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Job)
                .where(
                    Job.kind == JobKind.process_media,
                    Job.status == JobStatus.succeeded,
                    Job.created_at >= since,
                )
            )
        ).scalar_one()
        or 0
    )
    failed_24h = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Job)
                .where(
                    Job.kind == JobKind.process_media,
                    Job.status == JobStatus.failed,
                    Job.created_at >= since,
                )
            )
        ).scalar_one()
        or 0
    )
    total_24h = succeeded_24h + failed_24h
    # B4: ignore error % until enough samples (avoid 1/1 = 100% false alarm).
    if total_24h >= _MIN_JOBS_FOR_ERROR_RATE:
        error_rate_pct = round(100.0 * failed_24h / total_24h, 1)
    else:
        error_rate_pct = 0.0

    avg_seconds: float | None = None
    timing_rows = (
        (
            await session.execute(
                select(Job.timings).where(
                    Job.kind == JobKind.process_media,
                    Job.status == JobStatus.succeeded,
                    Job.created_at >= since,
                )
            )
        )
        .scalars()
        .all()
    )
    elapsed = []
    for t in timing_rows:
        if isinstance(t, dict) and t.get("elapsed_s") is not None:
            try:
                elapsed.append(float(t["elapsed_s"]))
            except (TypeError, ValueError):
                pass
    if elapsed:
        avg_seconds = round(sum(elapsed) / len(elapsed), 1)

    disk_free_gb: float | None = None
    disk_total_gb: float | None = None
    try:
        root = Path(settings.local_storage_path)
        root.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(root.resolve())
        disk_free_gb = round(usage.free / (1024**3), 2)
        disk_total_gb = round(usage.total / (1024**3), 2)
    except OSError:
        pass

    report = {
        "queue_length": queued,
        "running": running,
        "media_queued": media_queued,
        "succeeded_24h": succeeded_24h,
        "failed_24h": failed_24h,
        "error_rate_pct": error_rate_pct,
        "avg_process_seconds": avg_seconds,
        "disk_free_gb": disk_free_gb,
        "disk_total_gb": disk_total_gb,
        "storage_provider": settings.storage_provider,
        "alert_queue_threshold": settings.alert_queue_threshold,
        "alert_error_rate_pct": settings.alert_error_rate_pct,
    }
    if send_alerts:
        await maybe_send_ops_alert(report, settings=settings)
    return report


async def _redis_alert_cooldown_ok(settings: Settings) -> bool:
    """True if we may send (SET NX succeeded). Shared across workers (B4)."""
    try:
        from redis.asyncio import from_url

        r = from_url(settings.redis_url, decode_responses=True)
        try:
            ok = await r.set(_REDIS_ALERT_KEY, "1", nx=True, ex=_ALERT_COOLDOWN_S)
            return bool(ok)
        finally:
            await r.aclose()
    except Exception:  # noqa: BLE001
        logger.exception("redis alert cooldown failed; skipping send")
        return False


def _smtp_send(settings: Settings, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = settings.alert_email
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


async def maybe_send_ops_alert(
    report: dict[str, Any],
    *,
    settings: Settings | None = None,
) -> bool:
    """Send email when queue or error rate exceeds thresholds. Returns True if sent."""
    settings = settings or get_settings()
    if not settings.alert_email.strip():
        return False
    queue_hot = int(report.get("queue_length") or 0) >= settings.alert_queue_threshold
    err_hot = float(report.get("error_rate_pct") or 0) >= settings.alert_error_rate_pct
    if not (queue_hot or err_hot):
        return False
    if not await _redis_alert_cooldown_ok(settings):
        return False

    subject = "[Dictably] ops alert"
    body = (
        f"Queue length: {report.get('queue_length')}\n"
        f"Running: {report.get('running')}\n"
        f"Error rate 24h: {report.get('error_rate_pct')}%\n"
        f"Failed 24h: {report.get('failed_24h')}\n"
        f"Disk free GB: {report.get('disk_free_gb')}\n"
    )
    if not settings.smtp_host.strip():
        logger.warning("ops alert (no SMTP): %s\n%s", subject, body)
        return True
    try:
        await asyncio.to_thread(_smtp_send, settings, subject, body)
        logger.info("ops alert emailed to %s", settings.alert_email)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("failed to send ops alert email")
        return False


async def cron_ops_check(settings: Settings | None = None) -> dict[str, Any]:
    """arq cron entry: build report and alert if needed (B4)."""
    from dictably.db.session import get_session_factory

    settings = settings or get_settings()
    factory = get_session_factory(settings)
    async with factory() as session:
        return await ops_report(session, settings=settings, send_alerts=True)
