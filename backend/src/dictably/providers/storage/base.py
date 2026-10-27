from __future__ import annotations

from pathlib import Path
from typing import Protocol


class StorageProvider(Protocol):
    name: str

    async def put_bytes(self, key: str, data: bytes) -> str: ...

    async def get_path(self, key: str) -> Path: ...

    async def delete(self, key: str) -> None: ...
