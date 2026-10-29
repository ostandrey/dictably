#!/usr/bin/env python3
"""WER/DER eval harness (T-035).

Owner gold layout (gitignored):
  docs/eval/<clip_id>/ref.json   — { "text": "...", "segments": [{start_ms,end_ms,speaker_id,text}] }
  docs/eval/<clip_id>/hyp.json   — same shape from a pipeline run

Usage:
  uv run python scripts/asr_eval.py docs/eval/clip1/ref.json docs/eval/clip1/hyp.json
  uv run python scripts/asr_eval.py --dir docs/eval

Synthetic self-check (no Owner files):
  uv run python scripts/asr_eval.py --self-test
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running from backend/ without install quirks.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from dictably.domain.asr_metrics import score_pair  # noqa: E402


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _text_of(payload: dict) -> str:
    if payload.get("text"):
        return str(payload["text"])
    segs = payload.get("segments") or []
    return " ".join(str(s.get("text") or "") for s in segs)


def score_files(ref_path: Path, hyp_path: Path) -> dict[str, float]:
    ref = _load(ref_path)
    hyp = _load(hyp_path)
    return score_pair(
        ref_text=_text_of(ref),
        hyp_text=_text_of(hyp),
        ref_segments=list(ref.get("segments") or []),
        hyp_segments=list(hyp.get("segments") or []),
    )


def self_test() -> int:
    ref = {
        "text": "hello from left and reply from right",
        "segments": [
            {"start_ms": 0, "end_ms": 5000, "speaker_id": "L", "text": "hello from left"},
            {"start_ms": 5000, "end_ms": 10000, "speaker_id": "R", "text": "and reply from right"},
        ],
    }
    hyp = {
        "text": "hello from left and reply from right",
        "segments": [
            {"start_ms": 0, "end_ms": 5000, "speaker_id": "A", "text": "hello from left"},
            {"start_ms": 5000, "end_ms": 10000, "speaker_id": "B", "text": "and reply from right"},
        ],
    }
    scores = score_pair(
        ref_text=ref["text"],
        hyp_text=hyp["text"],
        ref_segments=ref["segments"],
        hyp_segments=hyp["segments"],
    )
    print(json.dumps({"self_test": scores}, indent=2))
    ok = scores["wer"] == 0.0 and scores["der"] == 0.0
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Dictably ASR WER/DER eval (T-035)")
    parser.add_argument("ref", nargs="?", type=Path, help="Reference JSON")
    parser.add_argument("hyp", nargs="?", type=Path, help="Hypothesis JSON")
    parser.add_argument("--dir", type=Path, help="Eval root with */ref.json + */hyp.json")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    rows: list[tuple[str, dict[str, float]]] = []
    if args.dir:
        for ref in sorted(args.dir.glob("*/ref.json")):
            hyp = ref.with_name("hyp.json")
            if not hyp.is_file():
                print(f"skip {ref.parent.name}: missing hyp.json", file=sys.stderr)
                continue
            rows.append((ref.parent.name, score_files(ref, hyp)))
    elif args.ref and args.hyp:
        rows.append((args.ref.stem, score_files(args.ref, args.hyp)))
    else:
        parser.print_help()
        return 2

    for name, scores in rows:
        print(f"{name}\tWER={scores['wer']:.3f}\tDER={scores['der']:.3f}")
    if not rows:
        print("No pairs scored. Add Owner gold under docs/eval/<id>/{ref,hyp}.json")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
