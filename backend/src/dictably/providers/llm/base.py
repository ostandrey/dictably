from __future__ import annotations

from typing import Any, Protocol


class MinutesProvider(Protocol):
    name: str

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        """Return minutes JSON with segment_ids evidence."""
        ...
