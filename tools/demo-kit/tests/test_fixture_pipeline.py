from __future__ import annotations

import wave
from pathlib import Path

import pytest

import demo_kit.paths as paths
from demo_kit.minutes import run_minutes
from demo_kit.render import _json_for_script, render
from demo_kit.transcribe import run_transcribe
from demo_kit.validate import ValidationError, load_minutes, load_transcript, validate_minutes


@pytest.fixture()
def sample_slug(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setattr(paths, "OUT", out)
    return "sample"


def test_fixture_all_pipeline(sample_slug: str) -> None:
    run_transcribe(None, slug=sample_slug, mode="fixture", fixture_name="sample")
    out = paths.ensure_out(sample_slug)
    assert (out / "transcript.json").is_file()
    wav = out / "audio.wav"
    assert wav.is_file()

    # S5: silent audio covers full meeting duration (seek to 12:01 works)
    t = load_transcript(out / "transcript.json")
    with wave.open(str(wav), "r") as w:
        dur_s = w.getnframes() / float(w.getframerate())
    assert dur_s >= (t.duration_ms / 1000) - 1

    path = run_minutes(sample_slug, mode="fixture", fixture_name="sample")
    assert path.name == "minutes.json"

    m = load_minutes(out / "minutes.json")
    validate_minutes(t, m)

    html = render(sample_slug)
    text = html.read_text(encoding="utf-8")
    assert "Стенограма" in text
    assert "data-seek-ms=" in text
    assert "721000" in text
    assert "Олена" in text  # S1 defaults from participants
    assert "sample" not in text.split("<header>", 1)[-1].split("</header>", 1)[0]
    assert "showEvidence" in text  # B2


def test_json_for_script_escapes_breakout() -> None:
    # S2
    payload = {"text": "</script><script>alert(1)</script><!--"}
    dumped = _json_for_script(payload)
    assert "</script>" not in dumped
    assert "<\\/script>" in dumped or "<\\/" in dumped


def test_validate_rejects_unknown_segment(sample_slug: str) -> None:
    run_transcribe(None, slug=sample_slug, mode="fixture")
    run_minutes(sample_slug, mode="fixture")
    out = paths.ensure_out(sample_slug)
    t = load_transcript(out / "transcript.json")
    m = load_minutes(out / "minutes.json")
    m.summary[0].segment_ids = ["S_MISSING"]
    with pytest.raises(ValidationError):
        validate_minutes(t, m)


def test_manual_writes_request_without_minutes(sample_slug: str) -> None:
    run_transcribe(None, slug=sample_slug, mode="fixture")
    out = paths.ensure_out(sample_slug)
    minutes_json = out / "minutes.json"
    if minutes_json.exists():
        minutes_json.unlink()
    path = run_minutes(sample_slug, mode="manual")
    assert path.name == "minutes_request.md"
    body = path.read_text(encoding="utf-8")
    assert "System prompt" in body
    assert "summary: 2–4 points" in body or "summary: 2-4 points" in body or (
        "Do not repeat agreements" in body
    )
    assert "[S1" in body or "[S2" in body
