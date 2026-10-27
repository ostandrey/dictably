from __future__ import annotations

import json
import shutil
from pathlib import Path

from demo_kit.audio import to_mono_m4a, write_silent_wav
from demo_kit.models import Transcript
from demo_kit.paths import ensure_out, fixture_dir


def run_transcribe(
    source: Path | None,
    *,
    slug: str,
    mode: str = "fixture",
    fixture_name: str = "sample",
) -> Path:
    """Write out/<slug>/transcript.json (+ audio). Returns transcript path."""
    out = ensure_out(slug)
    transcript_path = out / "transcript.json"
    audio_path = out / "audio.m4a"
    audio_wav = out / "audio.wav"

    if mode == "fixture":
        src = fixture_dir(fixture_name)
        if not (src / "transcript.json").is_file():
            raise FileNotFoundError(f"Missing fixture transcript: {src / 'transcript.json'}")
        shutil.copy2(src / "transcript.json", transcript_path)
        # Prefer fixture audio if present; else silent wav for offline player
        for name in ("audio.m4a", "audio.wav"):
            cand = src / name
            if cand.is_file():
                shutil.copy2(cand, out / name)
                break
        else:
            data = json.loads(transcript_path.read_text(encoding="utf-8"))
            # S5: full duration at 8 kHz / 8-bit so seek to late timestamps works
            dur_s = max(1.0, data.get("duration_ms", 14000) / 1000)
            write_silent_wav(audio_wav, duration_s=dur_s)
        return transcript_path

    if source is None or not source.is_file():
        raise FileNotFoundError("transcribe requires an audio/video file unless mode=fixture")

    if mode == "assemblyai":
        from demo_kit.transcribe.assemblyai import transcribe_assemblyai

        to_mono_m4a(source, audio_path)
        transcript = transcribe_assemblyai(audio_path)
        transcript_path.write_text(
            transcript.model_dump_json(indent=2),
            encoding="utf-8",
        )
        return transcript_path

    if mode == "local":
        from demo_kit.transcribe.local_asr import transcribe_local

        to_mono_m4a(source, audio_path)
        transcript = transcribe_local(audio_path)
        transcript_path.write_text(
            transcript.model_dump_json(indent=2),
            encoding="utf-8",
        )
        return transcript_path

    raise ValueError(f"Unknown transcribe mode: {mode!r}")


def load_out_transcript(slug: str) -> Transcript:
    path = ensure_out(slug) / "transcript.json"
    return Transcript.model_validate_json(path.read_text(encoding="utf-8"))
