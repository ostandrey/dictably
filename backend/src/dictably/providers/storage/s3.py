"""S3 / Cloudflare R2 storage (T-038). Browser uploads via presigned PUT."""

from __future__ import annotations

import asyncio
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError


class S3StorageProvider:
    name = "s3"

    def __init__(
        self,
        *,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
        endpoint_url: str | None = None,
        presign_endpoint_url: str | None = None,
        region: str = "auto",
        cache_dir: str | Path | None = None,
    ) -> None:
        if not bucket or not access_key_id or not secret_access_key:
            raise ValueError("S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY required")
        self.bucket = bucket
        self._endpoint = (endpoint_url or "").strip() or None
        # B7: browser needs a host it can reach; API/worker use the internal endpoint.
        presign_ep = (presign_endpoint_url or "").strip() or None
        self._presign_endpoint = presign_ep or self._endpoint
        # Fallback only — prefer set_work_dir() per job (B3).
        self._work_dir = Path(cache_dir or tempfile.gettempdir()) / "dictably-s3-work"
        self._work_dir.mkdir(parents=True, exist_ok=True)
        cfg = Config(signature_version="s3v4")
        self._client = boto3.client(
            "s3",
            endpoint_url=self._endpoint,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region or "auto",
            config=cfg,
        )
        if self._presign_endpoint == self._endpoint:
            self._presign_client = self._client
        else:
            self._presign_client = boto3.client(
                "s3",
                endpoint_url=self._presign_endpoint,
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                region_name=region or "auto",
                config=cfg,
            )

    def set_work_dir(self, path: str | Path) -> None:
        """Per-job temp directory; cleared by caller when the job ends (B3)."""
        self._work_dir = Path(path)
        self._work_dir.mkdir(parents=True, exist_ok=True)

    def _sync_put_bytes(self, key: str, data: bytes) -> None:
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data)

    async def put_bytes(self, key: str, data: bytes) -> str:
        await asyncio.to_thread(self._sync_put_bytes, key, data)
        return key

    async def put_stream(
        self,
        key: str,
        chunks: AsyncIterator[bytes],
        *,
        max_bytes: int | None = None,
    ) -> int:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            path = Path(tmp.name)
            size = 0
            try:
                async for chunk in chunks:
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise ValueError("too_large")
                    await asyncio.to_thread(tmp.write, chunk)
            except Exception:
                path.unlink(missing_ok=True)
                raise
        try:
            await asyncio.to_thread(self._client.upload_file, str(path), self.bucket, key)
        finally:
            path.unlink(missing_ok=True)
        return size

    async def get_path(self, key: str) -> Path:
        """Download into work_dir (job temp). Caller must wipe work_dir after use."""
        safe = key.replace("/", "__")
        dest = self._work_dir / safe
        dest.parent.mkdir(parents=True, exist_ok=True)

        def _download() -> None:
            try:
                self._client.head_object(Bucket=self.bucket, Key=key)
            except ClientError as exc:
                raise FileNotFoundError(key) from exc
            self._client.download_file(self.bucket, key, str(dest))

        await asyncio.to_thread(_download)
        if not dest.is_file():
            raise FileNotFoundError(key)
        return dest

    async def delete(self, key: str) -> None:
        def _del() -> None:
            try:
                self._client.delete_object(Bucket=self.bucket, Key=key)
            except Exception:  # noqa: BLE001 — best-effort
                pass
            cached = self._work_dir / key.replace("/", "__")
            if cached.is_file():
                cached.unlink()

        await asyncio.to_thread(_del)

    async def exists(self, key: str) -> bool:
        def _head() -> bool:
            try:
                self._client.head_object(Bucket=self.bucket, Key=key)
                return True
            except Exception:  # noqa: BLE001
                return False

        return await asyncio.to_thread(_head)

    async def head_size(self, key: str) -> int | None:
        def _head() -> int | None:
            try:
                resp = self._client.head_object(Bucket=self.bucket, Key=key)
                return int(resp.get("ContentLength") or 0)
            except Exception:  # noqa: BLE001
                return None

        return await asyncio.to_thread(_head)

    def presign_put(
        self,
        key: str,
        *,
        content_type: str | None = None,
        content_length: int | None = None,
        expires_in: int = 3600,
    ) -> str:
        params: dict = {"Bucket": self.bucket, "Key": key}
        if content_type:
            params["ContentType"] = content_type
        if content_length is not None:
            params["ContentLength"] = int(content_length)
        return self._presign_client.generate_presigned_url(
            "put_object",
            Params=params,
            ExpiresIn=expires_in,
            HttpMethod="PUT",
        )

    def create_multipart_upload(self, key: str, *, content_type: str | None = None) -> str:
        kwargs: dict = {"Bucket": self.bucket, "Key": key}
        if content_type:
            kwargs["ContentType"] = content_type
        resp = self._client.create_multipart_upload(**kwargs)
        return str(resp["UploadId"])

    def abort_multipart_upload(self, key: str, *, upload_id: str) -> None:
        try:
            self._client.abort_multipart_upload(Bucket=self.bucket, Key=key, UploadId=upload_id)
        except Exception:  # noqa: BLE001 — best-effort
            pass

    def presign_upload_part(
        self,
        key: str,
        *,
        upload_id: str,
        part_number: int,
        expires_in: int = 3600,
    ) -> str:
        return self._presign_client.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=expires_in,
            HttpMethod="PUT",
        )

    def complete_multipart_upload(
        self,
        key: str,
        *,
        upload_id: str,
        parts: list[dict[str, int | str]],
    ) -> None:
        self._client.complete_multipart_upload(
            Bucket=self.bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )
