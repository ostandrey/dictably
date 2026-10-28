from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from dictably.api.deps import require_user
from dictably.api.schemas import MediaListOut
from dictably.db.models import User

router = APIRouter(tags=["media"])


@router.get("/media", response_model=MediaListOut)
async def list_media(_user: Annotated[User, Depends(require_user)]) -> MediaListOut:
    """Stub list — full upload/list arrives in T-012. Auth required (401 without session)."""
    return MediaListOut(items=[])
