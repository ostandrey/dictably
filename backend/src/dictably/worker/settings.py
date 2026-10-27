from arq.connections import RedisSettings

from dictably.core.config import get_settings
from dictably.core.logging import configure_logging
from dictably.worker.tasks import ping, smoke_providers


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def on_startup(ctx: dict) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    ctx["settings"] = settings


class WorkerSettings:
    """arq worker entry: `arq dictably.worker.settings.WorkerSettings`."""

    functions = [ping, smoke_providers]
    on_startup = on_startup
    redis_settings = redis_settings()
