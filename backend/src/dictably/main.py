from contextlib import asynccontextmanager

from fastapi import FastAPI

from dictably import __version__
from dictably.api.router import api_router
from dictably.core.config import get_settings
from dictably.core.logging import configure_logging
from dictably.db.session import reset_engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    yield
    await reset_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Dictably API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.is_dev else None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    # Mount under /api so nginx / Next rewrite can proxy /api/* unchanged.
    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
