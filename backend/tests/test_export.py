"""T-017: minutes/transcript export formats + ownership 404."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain.export import (
    ExportCtx,
    _labels_for,
    minutes_docx,
    minutes_html,
    minutes_markdown,
    minutes_pdf,
    transcript_srt,
    transcript_txt,
    transcript_vtt,
    weasyprint_available,
)
from dictably.domain.media import ProbeResult
from dictably.domain.minutes_schema import Minutes
from dictably.providers.storage.local import LocalStorageProvider


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


async def _login(client: AsyncClient, email: str = "exporter@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Exporter"},
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


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    monkeypatch.setattr(
        "dictably.domain.process.probe_file",
        lambda _p, **_k: ProbeResult(ok=True, duration_ms=12_000),
    )
    return store


def _sample_minutes() -> Minutes:
    return Minutes.model_validate(
        {
            "language": "uk",
            "title": "Нарада — Żółć",
            "parties": [
                {"id": "our", "label": "Наші"},
                {"id": "their", "label": "Їхні"},
            ],
            "participants": [],
            "summary": [
                {
                    "text": "Обговорили українську й polskie litery.",
                    "segment_ids": ["S1"],
                    "start_ms": 1500,
                }
            ],
            "decisions": [
                {
                    "text": "Затвердити порядок дня.",
                    "segment_ids": ["S1"],
                    "start_ms": 2000,
                }
            ],
            "agreements": [
                {
                    "party_id": "our",
                    "text": "Надіслати протокол.",
                    "segment_ids": ["S1"],
                    "start_ms": 1500,
                }
            ],
            "tasks": [
                {
                    "party_id": "their",
                    "text": "Підтвердити дату.",
                    "segment_ids": ["S2"],
                    "owner_speaker": "B",
                    "due_text": "п'ятниця",
                    "start_ms": 5000,
                }
            ],
            "deadlines_and_facts": [],
            "open_questions": [
                {
                    "text": "Чи потрібен Zoom?",
                    "segment_ids": ["S2"],
                    "start_ms": 6000,
                }
            ],
        }
    )


def _ctx(locale: str = "uk") -> ExportCtx:
    media = SimpleNamespace(
        id=uuid4(),
        filename="нарада.m4a",
        created_at=datetime(2026, 10, 14, 10, 30, tzinfo=UTC),
        duration_ms=90_000,
    )
    speakers = [
        SimpleNamespace(label="A", display_name="Олена", party="our"),
        SimpleNamespace(label="B", display_name="Piotr", party="their"),
    ]
    return ExportCtx(
        media=media,  # type: ignore[arg-type]
        speakers=speakers,  # type: ignore[arg-type]
        minutes=_sample_minutes(),
        locale=locale,
        labels=_labels_for(locale),
        base_url="https://dictably.example",
        recording_path=f"{'/uk' if locale == 'uk' else ''}/app/r/?id={media.id}",
    )


def test_minutes_structure_by_party_uk_labels() -> None:
    ctx = _ctx("uk")
    md = minutes_markdown(ctx)
    assert "Нарада — Żółć" in md
    assert "**Файл:**" in md
    assert "14 жовт. 2026, 10:30" in md
    assert "## Коротко" in md
    assert "Обговорили українську" in md
    # Party sections (not separate Agreements/Tasks headings)
    assert "Наші погодились" in md
    assert "Їхні погодились" in md
    assert "## Домовленості" not in md
    assert "## Задачі" not in md
    assert "## Рішення" in md
    assert "## Відкриті питання" in md
    assert "Згенеровано Dictably з аудіозапису" in md
    assert f"/uk/app/r/?id={ctx.media.id}&t=1" in md
    assert "☐" in md  # open tasks
    assert "✓" not in md

    html_doc = minutes_html(ctx)
    assert "Наші погодились" in html_doc
    assert "font-family: 'Onest'" in html_doc
    assert "counter(page)" in html_doc
    assert "class='mark'>☐" in html_doc
    assert "✓" not in html_doc
    assert "class='extra'>" in html_doc
    assert "grid-template-columns: 1.2em 3.2em 1fr" in html_doc

    docx = minutes_docx(ctx)
    assert docx[:2] == b"PK"


def test_minutes_en_labels() -> None:
    ctx = _ctx("en")
    md = minutes_markdown(ctx)
    assert "**File:**" in md
    assert "14 Oct 2026, 10:30" in md
    assert "## Summary" in md
    assert "agreed to" in md
    assert "Generated by Dictably from an audio recording" in md
    assert f"/app/r/?id={ctx.media.id}&t=" in md


@pytest.mark.skipif(
    not weasyprint_available(),
    reason="WeasyPrint needs Pango/Cairo — use Docker/Linux for PDF (T-017 S3)",
)
def test_minutes_pdf_weasyprint() -> None:
    pdf = minutes_pdf(_ctx("uk"))
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2_000


def test_transcript_srt_vtt_txt() -> None:
    speakers = [
        SimpleNamespace(label="A", display_name="Олена", party="our", color_idx=0),
    ]
    tr = SimpleNamespace(
        segments=[
            {
                "id": "S1",
                "speaker_id": "A",
                "start_ms": 0,
                "end_ms": 1200,
                "text": "Привіт Żółć",
            }
        ],
    )
    txt = transcript_txt(speakers=speakers, transcript=tr)  # type: ignore[arg-type]
    assert "Олена" in txt and "Привіт" in txt
    srt = transcript_srt(speakers=speakers, transcript=tr)  # type: ignore[arg-type]
    assert "00:00:00,000 --> 00:00:01,200" in srt
    vtt = transcript_vtt(speakers=speakers, transcript=tr)  # type: ignore[arg-type]
    assert vtt.startswith("WEBVTT")


@pytest.mark.asyncio
async def test_export_minutes_docx_md(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client)
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("standup-żółć.m4a", b"fake-audio", "audio/mp4")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]
    analysis = await client.get(f"/api/media/{media_id}/analysis")
    assert analysis.status_code == 200, analysis.text

    md = await client.get(f"/api/media/{media_id}/export?kind=minutes&format=md")
    assert md.status_code == 200, md.text
    assert "text/markdown" in md.headers["content-type"]
    assert "agreed to" in md.text.lower() or "погодились" in md.text.lower() or "Summary" in md.text

    docx = await client.get(f"/api/media/{media_id}/export?kind=minutes&format=docx")
    assert docx.status_code == 200, docx.text
    assert docx.content[:2] == b"PK"

    pdf = await client.get(f"/api/media/{media_id}/export?kind=minutes&format=pdf")
    if weasyprint_available():
        assert pdf.status_code == 200, pdf.text
        assert pdf.content[:4] == b"%PDF"
    else:
        assert pdf.status_code == 503
    _ = storage


@pytest.mark.asyncio
async def test_export_transcript_formats(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf = await _login(client, "tx@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("call.wav", b"xxxx", "audio/wav")},
    )
    assert up.status_code == 201, up.text
    media_id = up.json()["id"]

    for fmt, magic in (
        ("txt", None),
        ("srt", None),
        ("vtt", None),
        ("docx", b"PK"),
    ):
        res = await client.get(f"/api/media/{media_id}/export?kind=transcript&format={fmt}")
        assert res.status_code == 200, res.text
        if magic:
            assert res.content[:2] == magic
        else:
            assert len(res.content) > 0
    _ = storage


@pytest.mark.asyncio
async def test_export_foreign_media_404(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    csrf_a = await _login(client, "owner-a@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf_a},
        files={"file": ("a.wav", b"aaaa", "audio/wav")},
    )
    media_id = up.json()["id"]
    await client.post("/api/auth/logout", headers={auth_domain.CSRF_HEADER: csrf_a})
    await _login(client, "owner-b@example.com")
    res = await client.get(f"/api/media/{media_id}/export?kind=minutes&format=docx")
    assert res.status_code == 404
    res2 = await client.get(f"/api/media/{media_id}/export?kind=transcript&format=txt")
    assert res2.status_code == 404
    _ = storage
