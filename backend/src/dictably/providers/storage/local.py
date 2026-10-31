from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path


class LocalStorageProvider:
    name = "local"

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Reject absolute keys and .. traversal (S3).
        candidate = (self.root / key).resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError(f"storage key escapes root: {key!r}")
        return candidate

    async def put_bytes(self, key: str, data: bytes) -> str:
        path = self._path(key)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        await asyncio.to_thread(_write)
        return key

    async def put_stream(
        self,
        key: str,
        chunks: AsyncIterator[bytes],
        *,
        max_bytes: int | None = None,
    ) -> int:
        path = self._path(key)
        await asyncio.to_thread(lambda: path.parent.mkdir(parents=True, exist_ok=True))
        size = 0
        try:
            with path.open("wb") as out:
                async for chunk in chunks:
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise ValueError("too_large")
                    await asyncio.to_thread(out.write, chunk)
        except Exception:
            if path.is_file():
                await asyncio.to_thread(path.unlink)
            raise
        return size

    async def get_path(self, key: str) -> Path:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path

    async def delete(self, key: str) -> None:
        path = self._path(key)

        def _unlink() -> None:
            if path.is_file():
                path.unlink()

        await asyncio.to_thread(_unlink)

    async def exists(self, key: str) -> bool:
        path = self._path(key)
        return await asyncio.to_thread(path.is_file)

    async def head_size(self, key: str) -> int | None:
        path = self._path(key)

        def _size() -> int | None:
            if not path.is_file():
                return None
            return path.stat().st_size

        return await asyncio.to_thread(_size)
