from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.api.deps import require_user
from dictably.api.schemas import UserOut
from dictably.db.models import User
from dictably.db.session import get_db
from dictably.domain import ledger as ledger_domain

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserOut)
async def me(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    balance = await ledger_domain.balance_seconds(session, user.id)
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        role=user.role,
        balance_seconds=balance,
    )
