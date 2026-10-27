from __future__ import annotations

from dictably.core.config import Settings, get_settings
from dictably.providers.asr.fake import FakeASRProvider
from dictably.providers.llm.fake import FakeLLMProvider
from dictably.providers.storage.local import LocalStorageProvider


def get_asr_provider(settings: Settings | None = None) -> FakeASRProvider:
    settings = settings or get_settings()
    if settings.asr_provider != "fake":
        # Real providers arrive in later tasks; refuse silent paid calls in skeleton.
        raise ValueError(
            f"ASR provider {settings.asr_provider!r} not wired in T-002; use ASR_PROVIDER=fake"
        )
    return FakeASRProvider()


def get_llm_provider(settings: Settings | None = None) -> FakeLLMProvider:
    settings = settings or get_settings()
    if settings.llm_provider != "fake":
        raise ValueError(
            f"LLM provider {settings.llm_provider!r} not wired in T-002; use LLM_PROVIDER=fake"
        )
    return FakeLLMProvider()


def get_storage_provider(settings: Settings | None = None) -> LocalStorageProvider:
    settings = settings or get_settings()
    if settings.storage_provider != "local":
        raise ValueError(
            f"Storage {settings.storage_provider!r} not wired in T-002; use STORAGE_PROVIDER=local"
        )
    return LocalStorageProvider(settings.local_storage_path)
