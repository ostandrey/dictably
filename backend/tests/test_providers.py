import pytest

from dictably.providers.asr.fake import FakeASRProvider
from dictably.providers.llm.fake import FakeLLMProvider
from dictably.providers.storage.local import LocalStorageProvider


@pytest.mark.asyncio
async def test_fake_asr_and_llm_pipeline() -> None:
    asr = FakeASRProvider()
    llm = FakeLLMProvider()
    transcript = await asr.transcribe(audio_path="fixture://t")
    assert transcript["provider"] == "fake"
    assert len(transcript["segments"]) >= 1
    minutes = await llm.analyze(transcript=transcript)
    assert minutes["provider"] == "fake"
    assert minutes["agreements"][0]["segment_ids"]


@pytest.mark.asyncio
async def test_local_storage_roundtrip(tmp_path) -> None:
    store = LocalStorageProvider(tmp_path)
    await store.put_bytes("a/b.txt", b"hello")
    path = await store.get_path("a/b.txt")
    assert path.read_bytes() == b"hello"
    await store.delete("a/b.txt")
    with pytest.raises(FileNotFoundError):
        await store.get_path("a/b.txt")


@pytest.mark.asyncio
async def test_local_storage_rejects_traversal(tmp_path) -> None:
    store = LocalStorageProvider(tmp_path)
    with pytest.raises(ValueError):
        await store.put_bytes("../x", b"nope")
    with pytest.raises(ValueError):
        await store.get_path("/etc/passwd")
    with pytest.raises(ValueError):
        await store.delete("..\\windows\\system32")
