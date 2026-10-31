from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
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


@runtime_checkable
class DirectUploadStorage(Protocol):
    """Optional: browser uploads via presigned URL (R2/S3)."""

    async def exists(self, key: str) -> bool: ...

    async def head_size(self, key: str) -> int | None: ...

    def presign_put(
        self,
        key: str,
        *,
        content_type: str | None = None,
        expires_in: int = 3600,
    ) -> str: ...
