from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol


class StorageProvider(Protocol):
    name: str

    async def put_bytes(self, key: str, data: bytes) -> str: ...

    async def put_stream(
        self,
        key: str,
        chunks: AsyncIterator[bytes],
        *,
        max_bytes: int | None = None,
    ) -> int: ...

    async def get_path(self, key: str) -> Path: ...

    async def delete(self, key: str) -> None: ...
