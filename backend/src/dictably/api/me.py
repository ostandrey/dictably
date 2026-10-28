from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from dictably.api.deps import require_user
from dictably.api.schemas import UserOut
from dictably.db.models import User

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(require_user)]) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        role=user.role,
    )
