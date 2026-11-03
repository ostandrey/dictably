"""T-046: expanded media extensions + real ffprobe content checks."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from httpx import AsyncClient

from dictably.domain import auth as auth_domain
from dictably.domain.media import (
    ALLOWED_EXTENSIONS,
    ProbeResult,
    assert_allowed_extension,
    probe_file,
)
from dictably.providers.storage.local import LocalStorageProvider

FIXTURES = Path(__file__).parent / "fixtures" / "formats"
NEW_EXTS = (".opus", ".amr", ".3gp", ".m4v", ".avi", ".wma")
HAS_FFPROBE = shutil.which("ffprobe") is not None

pytestmark = pytest.mark.skipif(
    not HAS_FFPROBE, reason="ffprobe required for T-046 format fixtures"
)


async def _login(client: AsyncClient, email: str = "formats@example.com") -> str:
    login = await client.post(
        "/api/auth/dev-login",
        json={"email": email, "name": "Formats"},
    )
    assert login.status_code == 200, login.text
    csrf = login.cookies[auth_domain.CSRF_COOKIE]
    cons = await client.post(
        "/api/me/consent",
        headers={auth_domain.CSRF_HEADER: csrf},
        json={"marketing_opt_in": False},
    )
    assert cons.status_code == 200, cons.text
    return csrf


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalStorageProvider:
    root = tmp_path / "storage"
    root.mkdir()
    store = LocalStorageProvider(root)
    monkeypatch.setattr("dictably.api.media.get_storage", lambda: store)
    monkeypatch.setattr("dictably.domain.process.get_storage_provider", lambda _s=None: store)
    # Keep processing soft so upload path is what we assert; content gate is media.probe_file.
    monkeypatch.setattr(
        "dictably.domain.process.probe_file",
        lambda _p, **_k: ProbeResult(ok=True, duration_ms=300),
    )
    return store


def test_new_extensions_on_allowlist() -> None:
    for ext in NEW_EXTS:
        assert ext in ALLOWED_EXTENSIONS
        assert assert_allowed_extension(f"clip{ext}") == ext


@pytest.mark.parametrize("ext", NEW_EXTS)
def test_fixture_probes_ok(ext: str) -> None:
    path = FIXTURES / f"sample{ext}"
    assert path.is_file(), path
    result = probe_file(path, soft_missing=False)
    assert result.ok is True, (ext, result.error, result.format_name)
    assert result.duration_ms is not None and result.duration_ms > 0


def test_exe_renamed_to_opus_rejected(tmp_path: Path) -> None:
    fake = tmp_path / "malware.opus"
    fake.write_bytes(b"MZ\x90\x00fake-pe")
    result = probe_file(fake, soft_missing=False)
    assert result.ok is False
    assert result.error == "not_media"


@pytest.mark.asyncio
@pytest.mark.parametrize("ext", NEW_EXTS)
async def test_upload_accepts_real_fixture(
    client: AsyncClient,
    storage: LocalStorageProvider,
    ext: str,
) -> None:
    """Full upload path with real ffprobe (no media.probe monkeypatch)."""
    path = FIXTURES / f"sample{ext}"
    csrf = await _login(client, f"fmt-{ext[1:]}@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": (f"clip{ext}", path.read_bytes(), "application/octet-stream")},
    )
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["filename"] == f"clip{ext}"
    assert body["duration_ms"] is not None and body["duration_ms"] > 0
    assert list(storage.root.rglob(f"original{ext}"))


@pytest.mark.asyncio
async def test_upload_rejects_exe_as_opus(
    client: AsyncClient,
    storage: LocalStorageProvider,
) -> None:
    csrf = await _login(client, "exe-opus@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("notes.opus", b"MZ\x90\x00not-opus", "application/octet-stream")},
    )
    assert up.status_code == 422
    assert not any(p.is_file() for p in storage.root.rglob("*"))


@pytest.mark.asyncio
async def test_upload_rejects_unknown_extension(
    client: AsyncClient,
    storage: LocalStorageProvider,
) -> None:
    csrf = await _login(client, "xyz@example.com")
    up = await client.post(
        "/api/media",
        headers={auth_domain.CSRF_HEADER: csrf},
        files={"file": ("clip.xyz", b"not-media", "application/octet-stream")},
    )
    assert up.status_code == 422
    assert not any(p.is_file() for p in storage.root.rglob("*"))
