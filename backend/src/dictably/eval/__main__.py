"""CLI: uv run python -m dictably.eval [--docs path/to/docs/eval]."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from dictably.eval.runner import format_table, run_eval


async def _amain() -> int:
    parser = argparse.ArgumentParser(description="Dictably minutes eval (T-016a)")
    parser.add_argument(
        "--docs",
        type=Path,
        default=None,
        help="Path to docs/eval (loads cases/*.json when present)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write JSON report to this path",
    )
    parser.add_argument(
        "--no-synthetic",
        action="store_true",
        help="Skip built-in synthetic fixtures",
    )
    args = parser.parse_args()
    report = await run_eval(
        docs_eval_root=args.docs,
        include_synthetic=not args.no_synthetic,
    )
    print(format_table(report))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {args.out}")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_amain()))


if __name__ == "__main__":
    main()
