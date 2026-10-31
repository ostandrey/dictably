from arq.connections import RedisSettings
from arq.cron import cron

from dictably.core.config import get_settings
from dictably.core.logging import configure_logging
from dictably.worker.tasks import (
    abandon_uploads_tick,
    fair_queue_tick,
    ops_alert_tick,
    ping,
    process_media,
    purge_expired_originals,
    smoke_providers,
)


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def on_startup(ctx: dict) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    ctx["settings"] = settings


class WorkerSettings:
    """arq worker entry: `arq dictably.worker.settings.WorkerSettings`."""

    functions = [
        ping,
        smoke_providers,
        process_media,
        purge_expired_originals,
        fair_queue_tick,
        ops_alert_tick,
        abandon_uploads_tick,
    ]
    cron_jobs = [
        cron(purge_expired_originals, hour=3, minute=15),
        # Every minute: free slots + stale job reclaim (B1).
        cron(fair_queue_tick, minute=set(range(60))),
        # Every 5 minutes: email alerts (B4).
        cron(ops_alert_tick, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}),
        # Four times/day: abandon incomplete uploads (S1).
        cron(abandon_uploads_tick, hour={0, 6, 12, 18}, minute=20),
    ]
    on_startup = on_startup
    redis_settings = redis_settings()
    # Retries live in run_process_media (permanent vs transient). arq must not multiply (N1).
    max_tries = 1
    job_timeout = 1800
