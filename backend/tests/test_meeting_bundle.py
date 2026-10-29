"""T-035b: Zoom multi-file meeting (names, energy speakers, one ASR, size)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain import media as media_domain
from dictably.domain import meeting_bundle as meeting_bundle_domain
from dictably.domain import process as process_domain
from dictably.domain.ffmpeg_media import FfmpegError
from dictably.domain.media import ProbeResult
from dictably.domain.track_energy import (
    ENERGY_HZ,
    assign_speakers_by_energy,
    extract_track_envelopes,
    rms_envelope,
)
from dictably.domain.zoom_names import speaker_name_from_filename
from dictably.providers.storage.local import LocalStorageProvider

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("audioOlena.m4a", "Olena"),
        ("audio_John_Smith.m4a", "John Smith"),
        ("audioAndriy.wav", "Andriy"),
        ("GMT20240115-audioOlena.m4a", "Olena"),
        ("plain.wav", "Plain"),
    ],
)
def test_zoom_speaker_names(filename: str, expected: str) -> None:
    assert speaker_name_from_filename(filename) == expected


def test_assign_speakers_by_energy_three_tracks_with_overlap() -> None:
    """3 tracks; non-overlap → loudest; overlap → split on words."""
    tracks = [
        {"index": 0, "label": "A", "speaker_name": "Olena"},
        {"index": 1, "label": "B", "speaker_name": "Andriy"},
        {"index": 2, "label": "C", "speaker_name": "Marta"},
    ]
    hz = 100
    n = 300  # 3 s
    env_a = [0.02] * n
    env_b = [0.02] * n
    env_c = [0.02] * n
    # 0–1s: A only
    for i in range(0, 100):
        env_a[i] = 0.9
    # 1–2s: both active (overlap); A louder early, B louder late
    for i in range(100, 200):
        env_a[i] = 0.55
        env_b[i] = 0.55
    for i in range(100, 140):
        env_a[i] = 0.95
    for i in range(160, 200):
        env_b[i] = 0.95
    # 2–3s: C only
    for i in range(200, 300):
        env_c[i] = 0.9
    envelopes = [env_a, env_b, env_c]

    transcript: dict[str, Any] = {
        "provider": "fake",
        "language": "en",
        "duration_ms": 3_000,
        "speakers": [{"id": "X", "label": "X", "display_name": "X", "color_idx": 0}],
        "segments": [
            {
                "id": "S1",
                "speaker_id": "X",
                "start_ms": 0,
                "end_ms": 900,
                "text": "Hello from Olena",
            },
            {
                "id": "S2",
                "speaker_id": "X",
                "start_ms": 1000,
                "end_ms": 1900,
                "text": "hi there",
            },
            {
                "id": "S3",
                "speaker_id": "X",
                "start_ms": 2000,
                "end_ms": 2800,
                "text": "Marta here",
            },
        ],
        "words": [
            {"text": "Hello", "start_ms": 0, "end_ms": 300, "speaker_id": "X"},
            {"text": "from", "start_ms": 300, "end_ms": 500, "speaker_id": "X"},
            {"text": "Olena", "start_ms": 500, "end_ms": 900, "speaker_id": "X"},
            # Overlap window: first word A-energy mid, second B-energy mid
            {"text": "hi", "start_ms": 1050, "end_ms": 1300, "speaker_id": "X"},
            {"text": "there", "start_ms": 1500, "end_ms": 1850, "speaker_id": "X"},
            {"text": "Marta", "start_ms": 2000, "end_ms": 2300, "speaker_id": "X"},
            {"text": "here", "start_ms": 2300, "end_ms": 2800, "speaker_id": "X"},
        ],
    }
    out = assign_speakers_by_energy(transcript, tracks, envelopes, hz=hz)
    names = {s["display_name"] for s in out["speakers"]}
    assert names == {"Olena", "Andriy", "Marta"}
    first = next(s for s in out["segments"] if s["start_ms"] == 0)
    assert first["speaker_id"] == "A"
    last = next(s for s in out["segments"] if s["start_ms"] >= 2000)
    assert last["speaker_id"] == "C"
    mid = [s for s in out["segments"] if "hi" in s["text"] or "there" in s["text"]]
    assert len(mid) >= 2
    assert {s["speaker_id"] for s in mid} == {"A", "B"}
    hi_w = next(w for w in out["words"] if w["text"] == "hi")
    there_w = next(w for w in out["words"] if w["text"] == "there")
    assert hi_w["speaker_id"] == "A"
    assert there_w["speaker_id"] == "B"


async def _login(client: AsyncClient, email: str | None = None) -> str:
    res = await client.post(
        "/api/auth/dev-login",
        json={"email": email or f"t035b-{uuid4().hex[:8]}@example.com", "name": "Dev"},
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
    return ProbeResult(ok=True, duration_ms=600_000)  # 10 min


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    return store


@pytest.mark.asyncio
async def test_upload_meeting_bundle_one_asr_pass(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """3 tracks × 10 min → exactly one ASR call; meeting duration = 10 min not 30."""
    csrf = await _login(client)
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(meeting_bundle_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(process_domain, "probe_file", _ok_probe)

    calls: list[dict[str, Any]] = []
    real = process_domain._transcribe_with_fallback

    async def counting_transcribe(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return await real(*args, **kwargs)

    monkeypatch.setattr(process_domain, "_transcribe_with_fallback", counting_transcribe)

    res = await client.post(
        "/api/media",
        files=[
            ("files", ("audioOlena.m4a", b"fake-olena", "audio/mp4")),
            ("files", ("audioAndriy.m4a", b"fake-andriy", "audio/mp4")),
            ("files", ("audioMarta.m4a", b"fake-marta", "audio/mp4")),
        ],
        data={"meeting_bundle": "1", "language": "en"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "ready"
    assert len(calls) == 1, f"ASR must run once, got {len(calls)}"
    assert body["duration_ms"] == 600_000
    assert body["speakers_expected"] == 3

    media_id = body["id"]
    tr = await client.get(f"/api/media/{media_id}/transcript")
    assert tr.status_code == 200
    speakers = tr.json()["speakers"]
    names = {s["display_name"] for s in speakers}
    assert names == {"Olena", "Andriy", "Marta"}

    keep = speakers[0]["id"]
    merge = speakers[1]["id"]
    merged = await client.post(
        f"/api/media/{media_id}/speakers/merge",
        json={"keep_id": keep, "merge_ids": [merge]},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert merged.status_code == 200, merged.text
    assert len(merged.json()) == len(speakers) - 1

    renamed = await client.patch(
        f"/api/media/{media_id}/speakers/{keep}",
        json={"display_name": "Olena K"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["display_name"] == "Olena K"


@pytest.mark.asyncio
async def test_bundle_rejects_together_over_500mb(
    client: AsyncClient,
    storage: LocalStorageProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf = await _login(client)
    monkeypatch.setattr(media_domain, "probe_file", _ok_probe)
    monkeypatch.setattr(meeting_bundle_domain, "probe_file", _ok_probe)

    sizes = [300 * 1024 * 1024, 250 * 1024 * 1024]
    idx = {"i": 0}

    async def fat_put(key: str, chunks: Any, *, max_bytes: int | None = None) -> int:
        async for _ in chunks:
            pass
        path = storage._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"stub")
        i = idx["i"]
        idx["i"] += 1
        return sizes[i] if i < len(sizes) else 1

    monkeypatch.setattr(storage, "put_stream", fat_put)

    res = await client.post(
        "/api/media",
        files=[
            ("files", ("audioA.m4a", b"a", "audio/mp4")),
            ("files", ("audioB.m4a", b"b", "audio/mp4")),
        ],
        data={"meeting_bundle": "1"},
        headers={auth_domain.CSRF_HEADER: csrf},
    )
    assert res.status_code == 413, res.text
    detail = res.json()["detail"]
    assert "500" in detail or "Together" in detail


def test_extract_envelopes_no_synthetic_without_soft(tmp_path: Path) -> None:
    """B4: empty / unreadable tracks must not invent speakers in production mode."""
    empty = tmp_path / "empty.wav"
    empty.write_bytes(b"")
    with pytest.raises(FfmpegError, match="empty|envelope|ffmpeg"):
        extract_track_envelopes([empty, empty], duration_ms=1000, soft_missing=False)


def _write_gated_sine(
    ffmpeg: str,
    dest: Path,
    *,
    duration_s: float,
    active: list[tuple[float, float]] | list[tuple[float, float, float]],
    freq: int = 440,
) -> None:
    """Sine with volume gates: (start, end) → vol 1, or (start, end, vol)."""
    clauses: list[str] = []
    for item in active:
        if len(item) == 3:
            a, b, v = item
        else:
            a, b = item[0], item[1]
            v = 1.0
        clauses.append(f"if(between(t\\,{a}\\,{b})\\,{v}")
    # nest: if(c1, v1, if(c2, v2, … 0))
    vol = "0"
    for clause in reversed(clauses):
        vol = f"{clause}\\,{vol})"
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency={freq}:sample_rate=16000:duration={duration_s}",
        "-af",
        f"volume=eval=frame:volume='{vol}'",
        "-ac",
        "1",
        str(dest),
    ]
    completed = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=60)
    assert completed.returncode == 0, completed.stderr[-500:]


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg required for real PCM energy test (T-035b B3)")
def test_rms_envelope_real_sine_speech_vs_silence(tmp_path: Path) -> None:
    """B3: 16 kHz RMS windows — speech ≫ silence (regression vs -ar 100)."""
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg
    wav = tmp_path / "tone.wav"
    # 2 s tone @ 200 Hz, 2 s silence
    _write_gated_sine(ffmpeg, wav, duration_s=4.0, active=[(0.0, 2.0)], freq=200)
    env = rms_envelope(wav, soft_missing=False)
    assert len(env) >= 350  # ~4 s × 100 Hz
    speech = sum(env[:200]) / 200
    silence = sum(env[200:400]) / max(1, len(env[200:400]))
    # Full-scale sine RMS ≈ 0.7; lavfi sine is quieter — require clear speech≫silence.
    assert speech > 0.05, f"speech RMS too low: {speech}"
    assert silence < 0.01, f"silence RMS too high: {silence}"
    assert speech > silence * 20, f"speech {speech} vs silence {silence}"


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg required for real PCM energy test (T-035b B3)")
def test_assign_speakers_from_real_ffmpeg_tracks(tmp_path: Path) -> None:
    """A 0–2s, B 2–4s, C 4–6s, A+B 6–7s → correct labels + overlap split."""
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg
    track_a = tmp_path / "A.wav"
    track_b = tmp_path / "B.wav"
    track_c = tmp_path / "C.wav"
    # Overlap 6–7s: both present; A louder early, B louder late → word split
    _write_gated_sine(
        ffmpeg,
        track_a,
        duration_s=7.0,
        active=[(0.0, 2.0), (6.0, 6.5, 0.95), (6.5, 7.0, 0.35)],
        freq=440,
    )
    _write_gated_sine(
        ffmpeg,
        track_b,
        duration_s=7.0,
        active=[(2.0, 4.0), (6.0, 6.5, 0.35), (6.5, 7.0, 0.95)],
        freq=550,
    )
    _write_gated_sine(ffmpeg, track_c, duration_s=7.0, active=[(4.0, 6.0)], freq=660)

    envelopes = extract_track_envelopes(
        [track_a, track_b, track_c],
        duration_ms=7_000,
        soft_missing=False,
    )
    assert all(len(e) >= 650 for e in envelopes)

    # Speech ≫ silence on each track's exclusive window
    hz = ENERGY_HZ
    mean_a_early = sum(envelopes[0][0:200]) / 200
    mean_b_early = sum(envelopes[1][0:200]) / 200
    assert mean_a_early > mean_b_early * 5

    tracks = [
        {"index": 0, "label": "A", "speaker_name": "Olena"},
        {"index": 1, "label": "B", "speaker_name": "Andriy"},
        {"index": 2, "label": "C", "speaker_name": "Marta"},
    ]
    transcript: dict[str, Any] = {
        "provider": "fake",
        "language": "en",
        "duration_ms": 7_000,
        "speakers": [{"id": "X", "label": "X", "display_name": "X", "color_idx": 0}],
        "segments": [
            {"id": "S1", "speaker_id": "X", "start_ms": 200, "end_ms": 1800, "text": "Olena"},
            {"id": "S2", "speaker_id": "X", "start_ms": 2200, "end_ms": 3800, "text": "Andriy"},
            {"id": "S3", "speaker_id": "X", "start_ms": 4200, "end_ms": 5800, "text": "Marta"},
            {
                "id": "S4",
                "speaker_id": "X",
                "start_ms": 6000,
                "end_ms": 7000,
                "text": "both talking",
            },
        ],
        "words": [
            {"text": "Olena", "start_ms": 400, "end_ms": 1200, "speaker_id": "X"},
            {"text": "Andriy", "start_ms": 2400, "end_ms": 3200, "speaker_id": "X"},
            {"text": "Marta", "start_ms": 4400, "end_ms": 5200, "speaker_id": "X"},
            {"text": "both", "start_ms": 6050, "end_ms": 6400, "speaker_id": "X"},
            {"text": "talking", "start_ms": 6500, "end_ms": 6900, "speaker_id": "X"},
        ],
    }
    out = assign_speakers_by_energy(transcript, tracks, envelopes, hz=hz)
    by_text = {
        s["text"]: s["speaker_id"]
        for s in out["segments"]
        if s["text"] in {"Olena", "Andriy", "Marta"}
    }
    assert by_text.get("Olena") == "A"
    assert by_text.get("Andriy") == "B"
    assert by_text.get("Marta") == "C"
    # Overlap 6–7s: both A and B loud → word split into A then B
    overlap_segs = [
        s
        for s in out["segments"]
        if s["start_ms"] >= 5900 or "both" in s["text"] or "talking" in s["text"]
    ]
    assert {s["speaker_id"] for s in overlap_segs} == {"A", "B"}
    hi = next(w for w in out["words"] if w["text"] == "both")
    lo = next(w for w in out["words"] if w["text"] == "talking")
    assert hi["speaker_id"] == "A"
    assert lo["speaker_id"] == "B"
