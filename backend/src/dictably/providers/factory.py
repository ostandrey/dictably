from __future__ import annotations

from dictably.core.config import Settings, get_settings
from dictably.providers.asr.assemblyai import AssemblyAIProvider
from dictably.providers.asr.base import TranscriptionProvider
from dictably.providers.asr.fake import FakeASRProvider
from dictably.providers.llm.anthropic import AnthropicLLMProvider
from dictably.providers.llm.assemblyai_gateway import AssemblyAILLMProvider
from dictably.providers.llm.base import MinutesProvider
from dictably.providers.llm.fake import FakeLLMProvider
from dictably.providers.storage.base import StorageProvider
from dictably.providers.storage.local import LocalStorageProvider
from dictably.providers.storage.s3 import S3StorageProvider


def _build_asr(name: str, settings: Settings) -> TranscriptionProvider:
    if name == "fake":
        return FakeASRProvider()
    if name == "assemblyai":
        return AssemblyAIProvider(settings.assemblyai_api_key)
    raise ValueError(f"ASR provider {name!r} not supported; use fake or assemblyai")


def get_asr_provider(settings: Settings | None = None) -> TranscriptionProvider:
    settings = settings or get_settings()
    return _build_asr(settings.asr_provider.lower().strip(), settings)


def get_asr_fallback(
    settings: Settings | None = None,
    *,
    exclude: str,
) -> TranscriptionProvider | None:
    """Secondary ASR after primary failure (T-014)."""
    settings = settings or get_settings()
    name = (settings.asr_fallback or "").lower().strip()
    if not name or name == exclude:
        # Dev/test: fall back to fake so local path always completes.
        if exclude != "fake" and (settings.is_test or settings.is_dev):
            return FakeASRProvider()
        return None
    if name == exclude:
        return None
    try:
        return _build_asr(name, settings)
    except Exception:  # noqa: BLE001 — missing key etc.
        if exclude != "fake" and (settings.is_test or settings.is_dev):
            return FakeASRProvider()
        return None


def get_llm_provider(settings: Settings | None = None) -> MinutesProvider:
    settings = settings or get_settings()
    name = settings.llm_provider.lower().strip()
    if name == "fake":
        return FakeLLMProvider()
    if name == "anthropic":
        return AnthropicLLMProvider(
            settings.anthropic_api_key,
            model=settings.anthropic_model,
        )
    if name in {"assemblyai_gateway", "assemblyai-llm", "lemur"}:
        return AssemblyAILLMProvider(
            settings.assemblyai_api_key,
            model=settings.assemblyai_llm_model or None,
            region=settings.assemblyai_llm_region,
        )
    raise ValueError(
        f"LLM provider {settings.llm_provider!r} not supported; "
        "use fake, anthropic, or assemblyai_gateway"
    )


def get_storage_provider(settings: Settings | None = None) -> StorageProvider:
    settings = settings or get_settings()
    name = settings.storage_provider.lower().strip()
    if name == "local":
        return LocalStorageProvider(settings.local_storage_path)
    if name in {"r2", "s3"}:
        return S3StorageProvider(
            bucket=settings.s3_bucket,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            endpoint_url=settings.s3_endpoint_url or None,
            presign_endpoint_url=settings.s3_presign_endpoint_url or None,
            region=settings.s3_region,
            cache_dir=settings.local_storage_path,
        )
    raise ValueError(f"Storage {settings.storage_provider!r} not supported; use local, r2, or s3")
