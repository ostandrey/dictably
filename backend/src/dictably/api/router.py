from fastapi import APIRouter

from dictably.api import auth, health, me, media

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(media.router)
