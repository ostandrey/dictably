"""AssemblyAI ASR provider (MVP-0 fallback; T-014)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

UPLOAD_URL = "https://api.assemblyai.com/v2/upload"
TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript"
# 3-hour recording upper bound (T-013/14 B2).
DEFAULT_POLL_TIMEOUT_S = 1800.0


class AssemblyAIError(RuntimeError):
    pass


class AssemblyAIProvider:
    name = "assemblyai"

    def __init__(self, api_key: str, *, poll_timeout_s: float = DEFAULT_POLL_TIMEOUT_S) -> None:
        if not api_key.strip():
            raise AssemblyAIError("ASSEMBLYAI_API_KEY is empty")
        self.api_key = api_key.strip()
        self.poll_timeout_s = poll_timeout_s

    async def transcribe(
        self,
        *,
        audio_path: str,
        language: str | None = None,
        speakers_expected: int | None = None,
        word_boost: list[str] | None = None,
        dual_channel: bool = False,
    ) -> dict[str, Any]:
        path = Path(audio_path)
        if not path.is_file():
            raise AssemblyAIError(f"audio not found: {audio_path}")

        headers = {"authorization": self.api_key}
        async with httpx.AsyncClient(timeout=120.0) as client:
            tid: str | None = None
            try:
                upload_url = await self._upload(client, headers, path)
                body: dict[str, Any] = {
                    "audio_url": upload_url,
                    "dual_channel": dual_channel,
                    # Dual channel maps channel→speaker; speaker_labels only for mono diarization.
                    "speaker_labels": not dual_channel,
                }
                if speakers_expected is not None and speakers_expected >= 1 and not dual_channel:
                    body["speakers_expected"] = int(speakers_expected)
                if word_boost:
                    # AssemblyAI word_boost: up to ~1000 terms.
                    body["word_boost"] = [w.strip() for w in word_boost if w and w.strip()][:200]
                    body["boost_param"] = "high"
                if language:
                    body["language_code"] = language
                else:
                    body["language_detection"] = True

                create = await client.post(TRANSCRIPT_URL, headers=headers, json=body)
                create.raise_for_status()
                tid = create.json()["id"]

                raw = await self._poll(client, headers, tid)
                if raw.get("status") == "error":
                    raise AssemblyAIError(raw.get("error") or "transcription failed")
                return normalize_assemblyai(raw)
            finally:
                # Privacy: delete remote transcript on success, error, or timeout (B2).
                if tid is not None:
                    try:
                        await client.delete(f"{TRANSCRIPT_URL}/{tid}", headers=headers)
                    except Exception:  # noqa: BLE001
                        logger.warning("assemblyai delete failed for %s", tid)

    async def _upload(self, client: httpx.AsyncClient, headers: dict[str, str], path: Path) -> str:
        data = await asyncio.to_thread(path.read_bytes)
        res = await client.post(
            UPLOAD_URL,
            headers={**headers, "content-type": "application/octet-stream"},
            content=data,
        )
        res.raise_for_status()
        return res.json()["upload_url"]

    async def _poll(
        self, client: httpx.AsyncClient, headers: dict[str, str], transcript_id: str
    ) -> dict[str, Any]:
        elapsed = 0.0
        while elapsed < self.poll_timeout_s:
            res = await client.get(f"{TRANSCRIPT_URL}/{transcript_id}", headers=headers)
            res.raise_for_status()
            payload = res.json()
            if payload.get("status") in {"completed", "error"}:
                return payload
            await asyncio.sleep(3)
            elapsed += 3
        raise AssemblyAIError("transcription timed out")


def _channel_label(raw_speaker: object) -> str:
    """Map AssemblyAI dual-channel speakers 1/2 → L/R."""
    s = str(raw_speaker or "A")
    if s in {"1", "channel_1", "Channel 1"}:
        return "L"
    if s in {"2", "channel_2", "Channel 2"}:
        return "R"
    return s


def normalize_assemblyai(raw: dict[str, Any]) -> dict[str, Any]:
    """Map AssemblyAI transcript JSON → Dictably segments/words/speakers."""
    utterances = raw.get("utterances") or []
    words_raw = raw.get("words") or []
    speakers_map: dict[str, dict[str, str]] = {}
    segments: list[dict[str, Any]] = []
    dual = bool(raw.get("dual_channel_mode") or raw.get("dual_channel"))

    for i, utt in enumerate(utterances, start=1):
        label = _channel_label(utt.get("speaker")) if dual else str(utt.get("speaker") or "A")
        display = {"L": "Left", "R": "Right"}.get(label)
        speakers_map.setdefault(
            label,
            {"id": label, "label": label, **({"display_name": display} if display else {})},
        )
        start_ms = int(utt.get("start") or 0)
        end_ms = int(utt.get("end") or start_ms)
        segments.append(
            {
                "id": f"S{i}",
                "speaker_id": label,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "text": (utt.get("text") or "").strip(),
            }
        )

    if not segments and raw.get("text"):
        speakers_map["A"] = {"id": "A", "label": "A"}
        segments.append(
            {
                "id": "S1",
                "speaker_id": "A",
                "start_ms": 0,
                "end_ms": int(raw.get("audio_duration") or 0) * 1000,
                "text": str(raw["text"]).strip(),
            }
        )

    words = [
        {
            "text": w.get("text"),
            "start_ms": int(w.get("start") or 0),
            "end_ms": int(w.get("end") or 0),
            "speaker_id": (_channel_label(w.get("speaker")) if dual else w.get("speaker")),
            **({"confidence": float(w["confidence"])} if w.get("confidence") is not None else {}),
        }
        for w in words_raw
    ]

    duration_ms = None
    if raw.get("audio_duration") is not None:
        try:
            duration_ms = int(float(raw["audio_duration"]) * 1000)
        except (TypeError, ValueError):
            duration_ms = None

    return {
        "provider": "assemblyai",
        "model": raw.get("audio_model") or "assemblyai",
        "language": raw.get("language_code"),
        "duration_ms": duration_ms,
        "speakers": list(speakers_map.values()),
        "segments": segments,
        "words": words,
        "cost_usd": None,
    }
