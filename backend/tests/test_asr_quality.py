"""T-035: ASR prep helpers, WER/DER, word edit, speaker merge."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import process as process_domain
from dictably.domain.asr_metrics import der, score_pair, wer
from dictably.domain.asr_postprocess import (
    drop_hallucinations_and_repeats,
    postprocess_transcript,
    split_long_segments,
)
from dictably.domain.media import ProbeResult
from dictably.providers.asr.fake import FakeASRProvider
from dictably.providers.storage.local import LocalStorageProvider


def test_wer_perfect_and_errors():
    assert wer("hello world", "hello world") == 0.0
    assert wer("hello world", "hello there") == 0.5
    assert wer("a b c", "a b c d") == pytest.approx(1 / 3)


def test_der_perfect_mapping():
    ref = [
        {"start_ms": 0, "end_ms": 1000, "speaker_id": "A"},
        {"start_ms": 1000, "end_ms": 2000, "speaker_id": "B"},
    ]
    hyp = [
        {"start_ms": 0, "end_ms": 1000, "speaker_id": "X"},
        {"start_ms": 1000, "end_ms": 2000, "speaker_id": "Y"},
    ]
    d = der(ref, hyp)
    assert d.der == pytest.approx(0.0)


def test_score_pair_fixture():
    scores = score_pair(
        ref_text="we agreed to update the table",
        hyp_text="we agreed to update the table",
        ref_segments=[
            {"start_ms": 0, "end_ms": 4000, "speaker_id": "A"},
            {"start_ms": 4000, "end_ms": 8000, "speaker_id": "B"},
        ],
        hyp_segments=[
            {"start_ms": 0, "end_ms": 4000, "speaker_id": "A"},
            {"start_ms": 4000, "end_ms": 8000, "speaker_id": "B"},
        ],
    )
    assert scores["wer"] == 0.0
    assert scores["der"] == 0.0


def test_split_long_segments():
    words = [
        {"text": "a", "start_ms": 0, "end_ms": 500},
        {"text": "b.", "start_ms": 600, "end_ms": 12_000},
        {"text": "c", "start_ms": 14_000, "end_ms": 20_000},
        {"text": "d", "start_ms": 20_500, "end_ms": 40_000},
    ]
    segs = [
        {
            "id": "S1",
            "speaker_id": "A",
            "start_ms": 0,
            "end_ms": 40_000,
            "text": "a b. c d",
        }
    ]
    out = split_long_segments(segs, words)
    assert len(out) >= 2


def test_drop_hallucinations_and_repeats():
    segs = [
        {"id": "S1", "text": "hello", "start_ms": 0, "end_ms": 1000, "speaker_id": "A"},
        {
            "id": "S2",
            "text": "Thanks for watching",
            "start_ms": 1000,
            "end_ms": 2000,
            "speaker_id": "A",
        },
        {"id": "S3", "text": "same", "start_ms": 2000, "end_ms": 3000, "speaker_id": "A"},
        {"id": "S4", "text": "same", "start_ms": 3000, "end_ms": 4000, "speaker_id": "A"},
        {"id": "S5", "text": "same", "start_ms": 4000, "end_ms": 5000, "speaker_id": "A"},
        {"id": "S6", "text": "same", "start_ms": 5000, "end_ms": 6000, "speaker_id": "A"},
    ]
    kept, dropped = drop_hallucinations_and_repeats(segs)
    assert dropped >= 2
    assert all("thanks for watching" not in s["text"].lower() for s in kept)


def test_postprocess_sets_warning_meta():
    raw = {
        "segments": [
            {"id": "S1", "speaker_id": "A", "start_ms": 0, "end_ms": 1000, "text": "hi"},
        ],
        "words": [{"text": "hi", "start_ms": 0, "end_ms": 1000, "confidence": 0.4}],
        "duration_ms": 120_000,
    }
    out = postprocess_transcript(raw, duration_ms=120_000, sample_rate_hint=8000)
    assert out["postprocess"]["quality_warning"]


@pytest.mark.asyncio
async def test_fake_dual_channel_two_speakers():
    fake = FakeASRProvider()
    result = await fake.transcribe(audio_path="/tmp/x.wav", dual_channel=True)
    labels = {s["label"] for s in result["speakers"]}
    assert labels == {"L", "R"}
    assert {seg["speaker_id"] for seg in result["segments"]} == {"L", "R"}


async def _login(client: AsyncClient, email: str = "t035@example.com") -> str:
    res = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Dev"},
    )
    assert res.status_code == 200, res.text
    csrf = res.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text
    return csrf


def _ok_probe(_path: Path, **_kwargs: object) -> ProbeResult:
    return ProbeResult(ok=True, duration_ms=12_000)


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    return store


async def _upload_ready(
    client: AsyncClient,
    csrf: str,
    monkeypatch: pytest.MonkeyPatch,
    *,
    extra_data: dict | None = None,
) -> str:
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)
    res = await client.post(
        "/api/media",
        files={"file": ("short.wav", b"fake-audio-bytes", "audio/wav")},
        data=extra_data or None,
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "ready"
    return body["id"]


@pytest.mark.asyncio
async def test_word_edit_and_merge_speakers(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client)
    media_id = await _upload_ready(client, csrf, monkeypatch)

    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200
    words = tr.json()["words"]
    assert words
    old = words[0]["text"]

    patched = await client.patch(
        f"/api/media/{media_id}/words",
        json={"word_index": 0, "text": "Corrected"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["words"][0]["text"] == "Corrected"
    assert patched.json()["words"][0]["text"] != old

    speakers = patched.json()["speakers"]
    assert len(speakers) >= 2
    keep = speakers[0]["id"]
    merge = speakers[1]["id"]
    merged = await client.post(
        f"/api/media/{media_id}/speakers/merge",
        json={"keep_id": keep, "merge_ids": [merge]},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert merged.status_code == 200, merged.text
    assert len(merged.json()) == len(speakers) - 1

    media = await client.get(f"/api/media/{media_id}")
    assert media.json().get("meeting_date")

    md = await client.patch(
        f"/api/media/{media_id}",
        json={"meeting_date": (date.today() + timedelta(days=1)).isoformat()},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert md.status_code == 200
    assert md.json()["meeting_date"] == (date.today() + timedelta(days=1)).isoformat()


@pytest.mark.asyncio
async def test_upload_language_and_speakers_expected(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client, "t035b@example.com")
    media_id = await _upload_ready(
        client,
        csrf,
        monkeypatch,
        extra_data={"language": "uk", "speakers_expected": "2", "vocabulary": "Dictably,Acme"},
    )
    media = await client.get(f"/api/media/{media_id}")
    body = media.json()
    assert body["language"] == "uk"
    assert body["speakers_expected"] == 2
    assert "Dictably" in body.get("vocabulary", [])
