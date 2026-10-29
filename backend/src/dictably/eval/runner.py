"""Run minutes eval on synthetic fixtures and optional docs/eval/cases."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from dictably.domain.minutes_pipeline import run_minutes_pipeline
from dictably.eval.fixtures import FIXTURES
from dictably.eval.metrics import score_case
from dictably.providers.factory import get_llm_provider


def _load_owner_cases(root: Path) -> list[dict[str, Any]]:
    cases_dir = root / "cases"
    if not cases_dir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for path in sorted(cases_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("id", path.stem)
        out.append(data)
    return out


async def run_eval(
    *,
    docs_eval_root: Path | None = None,
    include_synthetic: bool = True,
) -> dict[str, Any]:
    llm = get_llm_provider()
    cases: list[dict[str, Any]] = []
    if include_synthetic:
        cases.extend(FIXTURES)
    if docs_eval_root is not None:
        cases.extend(_load_owner_cases(docs_eval_root))

    rows: list[dict[str, Any]] = []
    for case in cases:
        transcript = case["transcript"]
        predicted = await run_minutes_pipeline(llm, transcript=transcript, require_quote=True)
        predicted.pop("_validation_dropped", None)
        metrics = score_case(case["gold"], predicted)
        rows.append({"id": case["id"], **metrics, "provider": predicted.get("provider")})

    found_rates = [r["found_rate"] for r in rows]
    party_rates = [r["party_accuracy"] for r in rows]
    link_rates = [r["link_accuracy"] for r in rows]
    fabricated = sum(r["fabricated"] for r in rows)
    summary = {
        "cases": len(rows),
        "fabricated_total": fabricated,
        "mean_found_rate": sum(found_rates) / len(found_rates) if found_rates else 0.0,
        "mean_party_accuracy": sum(party_rates) / len(party_rates) if party_rates else 0.0,
        "mean_link_accuracy": sum(link_rates) / len(link_rates) if link_rates else 0.0,
        "targets": {
            "fabricated": 0,
            "found_rate": 0.90,
            "party_accuracy": 0.95,
            "link_accuracy": 0.95,
        },
    }
    return {"summary": summary, "rows": rows}


def format_table(report: dict[str, Any]) -> str:
    lines = [
        "id\tfound\tfabricated\tparty\tlink",
        "-" * 48,
    ]
    for r in report["rows"]:
        lines.append(
            f"{r['id']}\t{r['found_rate']:.0%}\t{r['fabricated']}\t"
            f"{r['party_accuracy']:.0%}\t{r['link_accuracy']:.0%}"
        )
    s = report["summary"]
    lines.append("-" * 48)
    lines.append(
        f"mean found={s['mean_found_rate']:.0%} party={s['mean_party_accuracy']:.0%} "
        f"link={s['mean_link_accuracy']:.0%} fabricated={s['fabricated_total']} "
        f"cases={s['cases']}"
    )
    return "\n".join(lines)
