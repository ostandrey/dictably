from fastapi import APIRouter

from dictably.api import admin, auth, health, me, media

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(media.router)
api_router.include_router(admin.router)
