from __future__ import annotations

import os
import time
import warnings
from pathlib import Path

import httpx

from demo_kit.models import Segment, Speaker, Transcript, Word

# B1: hard stop so polling cannot run forever
POLL_TIMEOUT_S = 30 * 60
POLL_INTERVAL_S = 2.0


def transcribe_assemblyai(audio_path: Path) -> Transcript:
    """AssemblyAI with speaker_labels + language detection; delete remote copy after."""
    api_key = os.environ.get("ASSEMBLYAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "ASSEMBLYAI_API_KEY missing. Set it in tools/demo-kit/.env or use --mode fixture."
        )

    headers = {"authorization": api_key}
    tid: str | None = None
    with httpx.Client(timeout=120.0) as client:
        with audio_path.open("rb") as f:
            up = client.post(
                "https://api.assemblyai.com/v2/upload",
                headers=headers,
                content=f,
            )
            up.raise_for_status()
            upload_url = up.json()["upload_url"]

        job = client.post(
            "https://api.assemblyai.com/v2/transcript",
            headers={**headers, "content-type": "application/json"},
            json={
                "audio_url": upload_url,
                "speaker_labels": True,
                "language_detection": True,
            },
        )
        job.raise_for_status()
        tid = job.json()["id"]

        deadline = time.monotonic() + POLL_TIMEOUT_S
        try:
            while True:
                if time.monotonic() > deadline:
                    raise RuntimeError(
                        f"AssemblyAI transcript {tid} timed out after "
                        f"{POLL_TIMEOUT_S // 60} minutes. "
                        "Check the AssemblyAI dashboard or retry."
                    )
                st = client.get(
                    f"https://api.assemblyai.com/v2/transcript/{tid}",
                    headers=headers,
                )
                st.raise_for_status()
                body = st.json()
                status = body["status"]
                if status == "completed":
                    transcript = _normalize(body)
                    break
                if status == "error":
                    raise RuntimeError(body.get("error") or "AssemblyAI error")
                time.sleep(POLL_INTERVAL_S)
        finally:
            # B1: delete remote transcript (+ uploaded media) for privacy promise
            if tid:
                _delete_transcript(client, headers, tid)

    return transcript


def _delete_transcript(
    client: httpx.Client,
    headers: dict[str, str],
    tid: str,
) -> None:
    try:
        resp = client.delete(
            f"https://api.assemblyai.com/v2/transcript/{tid}",
            headers=headers,
        )
        if resp.status_code >= 400:
            warnings.warn(
                f"Could not delete AssemblyAI transcript {tid}: "
                f"HTTP {resp.status_code} {resp.text[:200]}",
                stacklevel=2,
            )
    except Exception as e:  # noqa: BLE001 — privacy cleanup must not fail the run
        warnings.warn(
            f"Could not delete AssemblyAI transcript {tid}: {e}",
            stacklevel=2,
        )


def _normalize(body: dict) -> Transcript:
    utterances = body.get("utterances") or []
    words_raw = body.get("words") or []
    duration_ms = int(round(float(body.get("audio_duration") or 0) * 1000))
    language = body.get("language_code") or "en"

    speakers: dict[str, Speaker] = {}
    segments: list[Segment] = []
    seg_i = 0

    for utt in utterances:
        speaker = str(utt.get("speaker") or "A")
        speakers.setdefault(speaker, Speaker(id=speaker))
        start_ms = int(utt.get("start") or 0)
        end_ms = int(utt.get("end") or start_ms)
        text = (utt.get("text") or "").strip()
        chunks = _split_long(utt, words_raw, max_ms=30_000)
        if not chunks:
            chunks = [(start_ms, end_ms, text, [])]
        for c_start, c_end, c_text, c_words in chunks:
            seg_i += 1
            segments.append(
                Segment(
                    id=f"S{seg_i}",
                    speaker=speaker,
                    start_ms=c_start,
                    end_ms=c_end,
                    text=c_text,
                    words=c_words,
                )
            )

    if not segments and body.get("text"):
        speakers["A"] = Speaker(id="A")
        segments.append(
            Segment(
                id="S1",
                speaker="A",
                start_ms=0,
                end_ms=duration_ms,
                text=body["text"],
                words=[],
            )
        )

    return Transcript(
        language=language.split("-")[0] if language else "en",
        duration_ms=duration_ms or (segments[-1].end_ms if segments else 0),
        speakers=list(speakers.values()),
        segments=segments,
    )


def _split_long(
    utt: dict,
    all_words: list,
    max_ms: int,
) -> list[tuple[int, int, str, list[Word]]]:
    start_ms = int(utt.get("start") or 0)
    end_ms = int(utt.get("end") or start_ms)
    text = (utt.get("text") or "").strip()
    if end_ms - start_ms <= max_ms:
        words = [
            Word(w=w["text"], s=int(w["start"]), e=int(w["end"]))
            for w in all_words
            if start_ms <= int(w.get("start") or 0) <= end_ms and w.get("text")
        ]
        return [(start_ms, end_ms, text, words)]

    u_words = [
        w for w in all_words if start_ms <= int(w.get("start") or 0) <= end_ms and w.get("text")
    ]
    if len(u_words) < 2:
        return [(start_ms, end_ms, text, [])]

    chunks: list[tuple[int, int, str, list[Word]]] = []
    cur: list[dict] = [u_words[0]]
    for prev, nxt in zip(u_words, u_words[1:], strict=False):
        gap = int(nxt["start"]) - int(prev["end"])
        span = int(nxt["end"]) - int(cur[0]["start"])
        if span > max_ms and gap >= 300:
            chunks.append(_chunk_from_words(cur))
            cur = [nxt]
        else:
            cur.append(nxt)
    if cur:
        chunks.append(_chunk_from_words(cur))
    return chunks


def _chunk_from_words(words: list[dict]) -> tuple[int, int, str, list[Word]]:
    ws = [Word(w=w["text"], s=int(w["start"]), e=int(w["end"])) for w in words]
    text = " ".join(w.w for w in ws)
    return ws[0].s, ws[-1].e, text, ws
