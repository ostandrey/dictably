"""T-038 B7: multipart ~500 MB → MinIO; API only sees intent + complete.

Requires compose with STORAGE_PROVIDER=s3, MinIO up, web/api on :3000.

  uv run python scripts/prove_direct_upload_500mb.py

Prints nginx access lines (docker logs) + object size via HEAD.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx

BASE = os.environ.get("DICTABLY_BASE", "http://127.0.0.1:3000").rstrip("/")
SIZE = int(os.environ.get("PROVE_SIZE_BYTES", str(500 * 1024 * 1024)))
EMAIL = os.environ.get("PROVE_EMAIL", "prove-500mb@example.com")
COMPOSE = Path(__file__).resolve().parents[2] / "infra" / "docker-compose.yml"


def _csrf(client: httpx.Client) -> str:
    from dictably.domain import auth as auth_domain

    login = client.post(
        f"{BASE}/api/auth/dev-login",
        json={"email": EMAIL, "name": "Prove"},
    )
    login.raise_for_status()
    csrf = login.cookies.get(auth_domain.CSRF_COOKIE)
    if not csrf:
        raise RuntimeError("missing CSRF cookie after dev-login")
    cons = client.post(
        f"{BASE}/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    cons.raise_for_status()
    return csrf


def _put_part(url: str, data: bytes) -> str:
    r = httpx.put(url, content=data, timeout=600.0)
    r.raise_for_status()
    etag = r.headers.get("ETag") or r.headers.get("etag")
    if not etag:
        raise RuntimeError(f"part response missing ETag: {r.status_code} {r.headers}")
    return etag.strip('"')


def main() -> int:
    print(f"BASE={BASE} SIZE={SIZE}")
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        csrf = _csrf(client)
        from dictably.domain import auth as auth_domain

        intent = client.post(
            f"{BASE}/api/media/upload-intent",
            headers={auth_domain.CSRF_HEADER: csrf},
            json={
                "filename": "prove-500mb.m4a",
                "content_type": "audio/mp4",
                "size_bytes": SIZE,
            },
        )
        if intent.status_code >= 400:
            print(intent.text, file=sys.stderr)
            intent.raise_for_status()
        body = intent.json()
        print("intent:", json.dumps({k: body[k] for k in body if k != "parts"}, indent=2))
        if body.get("mode") != "multipart":
            print("expected multipart mode", file=sys.stderr)
            return 1

        part_size = int(body["part_size"])
        parts_meta = body["parts"]
        completed: list[dict] = []
        remaining = SIZE
        for i, p in enumerate(parts_meta):
            n = min(part_size, remaining)
            # Zero-filled body is fine: complete only HEAD-checks size.
            chunk = b"\0" * n
            print(f"  PUT part {p['part_number']} ({n} bytes)…")
            etag = _put_part(p["url"], chunk)
            completed.append({"part_number": int(p["part_number"]), "etag": etag})
            remaining -= n
            if remaining <= 0 and i + 1 < len(parts_meta):
                print("size exhausted early", file=sys.stderr)
                return 1

        media_id = body["media_id"]
        complete = client.post(
            f"{BASE}/api/media/{media_id}/upload-complete",
            headers={auth_domain.CSRF_HEADER: csrf},
            json={"upload_id": body["upload_id"], "parts": completed},
        )
        if complete.status_code >= 400:
            print(complete.text, file=sys.stderr)
            complete.raise_for_status()
        print("complete:", complete.status_code, complete.json().get("status"))

    # Object size via boto against host MinIO.
    try:
        import boto3
        from botocore.client import Config

        key = body["key"]
        s3 = boto3.client(
            "s3",
            endpoint_url=os.environ.get("S3_PRESIGN_ENDPOINT_URL", "http://127.0.0.1:9000"),
            aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID", "dictably"),
            aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY", "dictablydictably"),
            region_name=os.environ.get("S3_REGION", "us-east-1"),
            config=Config(signature_version="s3v4"),
        )
        head = s3.head_object(Bucket=os.environ.get("S3_BUCKET", "dictably"), Key=key)
        print(f"mc/head size: {head['ContentLength']} (expected {SIZE})")
    except Exception as exc:  # noqa: BLE001
        print(f"head_object failed: {exc}", file=sys.stderr)

    # Nginx access evidence (last lines mentioning upload-*).
    try:
        logs = subprocess.check_output(
            [
                "docker",
                "compose",
                "-f",
                str(COMPOSE),
                "logs",
                "--no-color",
                "--tail",
                "200",
                "web",
            ],
            text=True,
            stderr=subprocess.STDOUT,
        )
        print("--- nginx / web logs (upload-intent|upload-complete|POST /api/media) ---")
        for line in logs.splitlines():
            if "upload-intent" in line or "upload-complete" in line or "POST /api/media" in line:
                print(line)
    except Exception as exc:  # noqa: BLE001
        print(f"docker logs failed: {exc}", file=sys.stderr)
        print("Paste manually: docker compose -f infra/docker-compose.yml logs --tail 200 web")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
