from __future__ import annotations

from typing import Any, Protocol


class MinutesProvider(Protocol):
    name: str

    async def analyze(self, *, transcript: dict[str, Any]) -> dict[str, Any]:
        """Legacy single-shot minutes (still used by pipeline fallback)."""

    async def extract(
        self,
        *,
        transcript: dict[str, Any],
        user_message: str,
        language: str,
        template: str = "default",
    ) -> dict[str, Any]:
        """Pass 1 — extract minutes with quotes (template: default | official_protocol)."""

    async def verify(
        self,
        *,
        items: list[dict[str, Any]],
        language: str,
    ) -> dict[str, Any]:
        """Pass 2 — supported / weak / not_supported per item_id."""
