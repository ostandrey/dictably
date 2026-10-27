from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures"
OUT = ROOT / "out"


def slug_dir(slug: str) -> Path:
    return OUT / slug


def ensure_out(slug: str) -> Path:
    d = slug_dir(slug)
    d.mkdir(parents=True, exist_ok=True)
    return d


def fixture_dir(name: str = "sample") -> Path:
    return FIXTURES / name
