"""Ready-email helpers (T-040)."""

from __future__ import annotations

import asyncio
import logging
import re
import smtplib
from email.message import EmailMessage
from typing import Any

from dictably.core.config import Settings
from dictably.db.models import Media, User

logger = logging.getLogger(__name__)

# In-memory sink for ENV=test assertions only (S3).
READY_EMAIL_SINK: list[dict[str, Any]] = []


def clear_ready_email_sink() -> None:
    READY_EMAIL_SINK.clear()


def _smtp_send_to(settings: Settings, *, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def _copy(locale: str, *, title: str, link: str) -> tuple[str, str]:
    loc = (locale or "en").lower()
    safe_title = re.sub(r"[\r\n]+", " ", title).strip() or "Recording"
    safe_title = safe_title[:60]
    if loc.startswith("uk"):
        subject = f"Готово — {safe_title}"
        body = f"Ваші підсумки готові.\n\n{safe_title}\n{link}\n"
    else:
        subject = f"Ready — {safe_title}"
        body = f"Your minutes are ready.\n\n{safe_title}\n{link}\n"
    return subject, body


async def maybe_send_ready_email(
    *,
    settings: Settings,
    user: User,
    media: Media,
    processing_seconds: float,
) -> bool:
    """Send 'minutes ready' mail when processing took >5 min and user opted in."""
    if processing_seconds < 300:
        return False
    if not getattr(user, "notify_ready_email", True):
        return False
    title = (media.title or media.filename or "Recording").strip()
    link = f"{settings.public_app_url.rstrip('/')}/app/r/?id={media.id}"
    subject, body = _copy(user.locale or "en", title=title, link=link)
    payload = {
        "to": user.email,
        "subject": subject,
        "body": body,
        "media_id": str(media.id),
    }
    if settings.is_test:
        READY_EMAIL_SINK.append(payload)
    if not settings.smtp_host.strip():
        # No address in logs (S3).
        logger.info("ready-email (no SMTP): media=%s", media.id)
        return True
    try:
        await asyncio.to_thread(_smtp_send_to, settings, to=user.email, subject=subject, body=body)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("ready-email send failed")
        return False
