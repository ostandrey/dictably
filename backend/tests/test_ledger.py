from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from dictably.db.models import CreditKind, CreditLedger, User


@pytest.mark.asyncio
async def test_credit_ledger_ref_idempotent(db_session: AsyncSession) -> None:
    """S5: duplicate (user_id, kind, ref) when ref is set → IntegrityError."""
    user = User(email="ledger@example.com", locale="en", role="user", created_at=datetime.now(UTC))
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        CreditLedger(
            user_id=user.id,
            delta_seconds=-60,
            kind=CreditKind.reserve,
            ref="job-1",
            created_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    db_session.add(
        CreditLedger(
            user_id=user.id,
            delta_seconds=-60,
            kind=CreditKind.reserve,
            ref="job-1",
            created_at=datetime.now(UTC),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
