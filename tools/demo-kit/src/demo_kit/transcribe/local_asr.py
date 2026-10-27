from __future__ import annotations

from pathlib import Path

from demo_kit.models import Segment, Speaker, Transcript


def transcribe_local(audio_path: Path) -> Transcript:
    """faster-whisper on Owner machine (optional: uv sync --extra local).

    WARNING (S4): no diarization yet — every segment is speaker A. For demos use
    --mode assemblyai. pyannote lands with HF token + GPU later.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise RuntimeError(
            "faster-whisper not installed. Run: uv sync --extra local. "
            "For demos prefer --mode assemblyai (speaker labels)."
        ) from e

    model_size = "large-v3-turbo"
    model = WhisperModel(model_size, device="auto", compute_type="auto")
    segments_iter, info = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        vad_filter=True,
    )

    speakers = [Speaker(id="A")]
    segments: list[Segment] = []
    seg_i = 0
    for seg in segments_iter:
        start_ms = int(seg.start * 1000)
        end_ms = int(seg.end * 1000)
        text = (seg.text or "").strip()
        if not text:
            continue
        words = []
        if seg.words:
            from demo_kit.models import Word

            words = [
                Word(
                    w=w.word.strip(),
                    s=int(w.start * 1000),
                    e=int(w.end * 1000),
                )
                for w in seg.words
                if w.word and w.word.strip()
            ]
        # Split if longer than ~30s
        if end_ms - start_ms > 30_000 and words:
            chunks = _split_words(words, 30_000)
            for c_words in chunks:
                seg_i += 1
                segments.append(
                    Segment(
                        id=f"S{seg_i}",
                        speaker="A",
                        start_ms=c_words[0].s,
                        end_ms=c_words[-1].e,
                        text=" ".join(w.w for w in c_words),
                        words=c_words,
                    )
                )
        else:
            seg_i += 1
            segments.append(
                Segment(
                    id=f"S{seg_i}",
                    speaker="A",
                    start_ms=start_ms,
                    end_ms=end_ms,
                    text=text,
                    words=words,
                )
            )

    lang = getattr(info, "language", None) or "en"
    duration_ms = int(getattr(info, "duration", 0) * 1000) or (
        segments[-1].end_ms if segments else 0
    )
    return Transcript(
        language=lang,
        duration_ms=duration_ms,
        speakers=speakers,
        segments=segments,
    )


def _split_words(words: list, max_ms: int) -> list[list]:
    chunks: list[list] = []
    cur: list = [words[0]]
    for w in words[1:]:
        if w.e - cur[0].s > max_ms:
            chunks.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        chunks.append(cur)
    return chunks
