"""T-028: draft follow-up email from minutes — no invented points."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from dictably.db.models import Analysis, Media, MediaStatus, Speaker, Transcript, User
from dictably.db.session import get_session_factory
from dictably.domain import auth as auth_domain
from dictably.domain.follow_up import assert_body_subset_of_minutes, draft_follow_up_email
from dictably.domain.minutes_schema import Minutes


def _sample_minutes() -> Minutes:
    return Minutes.model_validate(
        {
            "language": "uk",
            "title": "Нарада з клієнтом",
            "parties": [
                {"id": "our", "label": "Наші"},
                {"id": "their", "label": "Клієнт"},
            ],
            "summary": [{"text": "Обговорили строк поставки.", "segment_ids": ["S1"]}],
            "decisions": [{"text": "Затвердити кошторис.", "segment_ids": ["S1"]}],
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Надіслати протокол.",
                    "segment_ids": ["S1"],
                },
                {
                    "party_id": "their",
                    "text": "Підтвердити адресу.",
                    "segment_ids": ["S2"],
                },
            ],
            "tasks": [
                {
                    "party_id": "our",
                    "text": "Підготувати рахунок.",
                    "owner_speaker": "A",
                    "due_text": "п'ятниця",
                    "segment_ids": ["S2"],
                }
            ],
            "open_questions": [{"text": "Чи потрібен Zoom?", "segment_ids": ["S2"]}],
        }
    )


def test_draft_contains_only_minutes_points() -> None:
    minutes = _sample_minutes()
    media = type("M", (), {"filename": "meeting.m4a", "language": "uk"})()
    speakers = [
        type("S", (), {"label": "A", "display_name": "Олена"})(),
        type("S", (), {"label": "B", "display_name": "Piotr"})(),
    ]
    draft = draft_follow_up_email(
        media=media,  # type: ignore[arg-type]
        minutes=minutes,
        speakers=speakers,  # type: ignore[arg-type]
    )
    assert draft.language == "uk"
    assert "Нарада з клієнтом" in draft.subject
    assert "Дякую за зустріч" in draft.body
    assert "Надіслати протокол." in draft.body
    assert "Підготувати рахунок." in draft.body
    assert "Олена" in draft.body
    assert "п'ятниця" in draft.body
    # B3: generic «Наші» → «З нашого боку»; custom «Клієнт» kept
    assert "З нашого боку" in draft.body
    assert "Домовленості — Клієнт" in draft.body
    assert "Домовленості — Їхні" not in draft.body
    assert assert_body_subset_of_minutes(draft.body, minutes) == []
    assert "вигаданий" not in draft.body.lower()


def test_draft_en_language() -> None:
    minutes = Minutes.model_validate(
        {
            "language": "en",
            "title": "Sprint sync",
            "parties": [{"id": "our", "label": "Our side"}],
            "agreements": [{"party_id": "our", "text": "Ship Friday.", "segment_ids": ["S1"]}],
            "tasks": [],
        }
    )
    media = type("M", (), {"filename": "sync.wav", "language": "en"})()
    draft = draft_follow_up_email(media=media, minutes=minutes, speakers=[])  # type: ignore[arg-type]
    assert draft.language == "en"
    assert draft.subject.startswith("Follow-up:")
    assert "Thank you for the meeting." in draft.body
    assert "Ship Friday." in draft.body
    assert "On our side" in draft.body
    assert assert_body_subset_of_minutes(draft.body, minutes) == []


def test_status_filter_excludes_rejected_and_weak() -> None:
    """B1: only agreed/null in body; proposed→open; rejected/changed_later/weak out."""
    minutes = Minutes.model_validate(
        {
            "language": "en",
            "title": "Status check",
            "parties": [
                {"id": "our", "label": "Our side"},
                {"id": "their", "label": "Acme Corp"},
            ],
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Agreed ship date.",
                    "status": "agreed",
                    "segment_ids": ["S1"],
                },
                {
                    "party_id": "our",
                    "text": "Maybe later.",
                    "status": "proposed",
                    "segment_ids": ["S1"],
                },
                {
                    "party_id": "their",
                    "text": "Rejected idea.",
                    "status": "rejected",
                    "segment_ids": ["S1"],
                },
                {
                    "party_id": "their",
                    "text": "Superseded clause.",
                    "status": "changed_later",
                    "segment_ids": ["S1"],
                },
                {
                    "party_id": "our",
                    "text": "Weak evidence point.",
                    "status": "agreed",
                    "verify": "weak",
                    "segment_ids": ["S1"],
                },
                {
                    "party_id": "their",
                    "text": "Null status ok.",
                    "segment_ids": ["S2"],
                },
            ],
            "tasks": [
                {
                    "party_id": "our",
                    "text": "Do the thing.",
                    "status": "agreed",
                    "segment_ids": ["S2"],
                },
                {
                    "party_id": "our",
                    "text": "Tentative task.",
                    "status": "tentative",
                    "segment_ids": ["S2"],
                },
            ],
        }
    )
    media = type("M", (), {"filename": "x.wav", "language": "en"})()
    draft = draft_follow_up_email(media=media, minutes=minutes, speakers=[])  # type: ignore[arg-type]
    assert "Agreed ship date." in draft.body
    assert "Null status ok." in draft.body
    assert "Do the thing." in draft.body
    assert "Maybe later." in draft.body  # proposed → open questions
    assert "Tentative task." in draft.body
    assert "Rejected idea." not in draft.body
    assert "Superseded clause." not in draft.body
    assert "Weak evidence point." not in draft.body
    assert draft.weak_skipped == 1
    assert "Weak evidence point." in draft.weak_texts
    assert "Acme Corp" in draft.body  # custom party name
    assert "On our side" in draft.body


def test_official_groups_by_agenda() -> None:
    """S1: official_protocol → decisions/tasks under agenda, not empty Summary."""
    minutes = Minutes.model_validate(
        {
            "language": "uk",
            "title": "Протокол",
            "template": "official_protocol",
            "parties": [{"id": "our", "label": "Наші"}],
            "agenda": [
                {
                    "text": "Бюджет",
                    "item_id": "A1",
                    "segment_ids": ["S1"],
                    "quote": "бюджет",
                }
            ],
            "summary": [],
            "heard": [
                {
                    "text": "Доповіла Олена",
                    "agenda_ref": "A1",
                    "status": "agreed",
                    "segment_ids": ["S1"],
                    "quote": "Доповіла",
                }
            ],
            "decisions": [
                {
                    "text": "Затвердити кошторис",
                    "agenda_ref": "A1",
                    "status": "agreed",
                    "segment_ids": ["S2"],
                    "quote": "Затвердити",
                },
                {
                    "text": "Відхилене рішення",
                    "agenda_ref": "A1",
                    "status": "rejected",
                    "segment_ids": ["S2"],
                    "quote": "Відхил",
                },
            ],
            "tasks": [
                {
                    "party_id": "our",
                    "text": "Надіслати таблицю",
                    "agenda_ref": "A1",
                    "status": "agreed",
                    "owner_speaker": "A",
                    "segment_ids": ["S2"],
                    "quote": "таблицю",
                }
            ],
        }
    )
    media = type("M", (), {"filename": "p.m4a", "language": "uk"})()
    speakers = [type("S", (), {"label": "A", "display_name": "Олена"})()]
    draft = draft_follow_up_email(
        media=media,  # type: ignore[arg-type]
        minutes=minutes,
        speakers=speakers,  # type: ignore[arg-type]
    )
    assert "Коротко" not in draft.body
    assert "Бюджет" in draft.body
    assert "Затвердити кошторис" in draft.body
    assert "Надіслати таблицю" in draft.body
    assert "Відхилене рішення" not in draft.body
    assert assert_body_subset_of_minutes(draft.body, minutes) == []


async def _login(client: AsyncClient, email: str) -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Follow"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text
    return csrf


@pytest.mark.asyncio
async def test_follow_up_api_and_ownership(client: AsyncClient) -> None:
    await _login(client, "owner-fu@example.com")

    factory = get_session_factory()
    async with factory() as session:
        owner = (
            await session.execute(select(User).where(User.email == "owner-fu@example.com"))
        ).scalar_one()
        media = Media(
            user_id=owner.id,
            filename="call.m4a",
            status=MediaStatus.ready,
            storage_keys={},
            language="uk",
        )
        session.add(media)
        await session.flush()
        session.add(
            Transcript(
                media_id=media.id,
                provider="fake",
                model="t",
                language="uk",
                segments=[],
                words=[],
            )
        )
        session.add(
            Speaker(
                media_id=media.id,
                label="A",
                display_name="Олена",
                party="our",
                color_idx=0,
            )
        )
        session.add(
            Analysis(
                media_id=media.id,
                template="default",
                provider="fake",
                model="m",
                result=_sample_minutes().model_dump(),
            )
        )
        await session.commit()
        media_id = media.id

    ok = await client.get(f"/api/media/{media_id}/follow-up")
    assert ok.status_code == 200, ok.text
    payload = ok.json()
    assert "Нарада з клієнтом" in payload["subject"]
    assert "Надіслати протокол." in payload["body"]
    assert "weak_skipped" in payload
    assert assert_body_subset_of_minutes(payload["body"], _sample_minutes()) == []

    await _login(client, "other-fu@example.com")
    foreign = await client.get(f"/api/media/{media_id}/follow-up")
    assert foreign.status_code == 404

    await _login(client, "empty-fu@example.com")
    async with factory() as session:
        empty_user = (
            await session.execute(select(User).where(User.email == "empty-fu@example.com"))
        ).scalar_one()
        empty = Media(
            user_id=empty_user.id,
            filename="empty.m4a",
            status=MediaStatus.ready,
            storage_keys={},
        )
        session.add(empty)
        await session.commit()
        empty_id = empty.id
    missing = await client.get(f"/api/media/{empty_id}/follow-up")
    assert missing.status_code == 404
