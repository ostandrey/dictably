from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Safe default: prod (S1). Local/compose must set ENV=dev explicitly.
    env: str = Field(default="prod", alias="ENV")
    database_url: str = Field(
        default="postgresql+asyncpg://dictably:dictably@127.0.0.1:55432/dictably",
        alias="DATABASE_URL",
    )
    test_database_url: str = Field(
        default="postgresql+asyncpg://dictably:dictably@127.0.0.1:55432/dictably_test",
        alias="TEST_DATABASE_URL",
    )
    redis_url: str = Field(default="redis://127.0.0.1:56379/0", alias="REDIS_URL")
    asr_provider: str = Field(default="fake", alias="ASR_PROVIDER")
    llm_provider: str = Field(default="fake", alias="LLM_PROVIDER")
    storage_provider: str = Field(default="local", alias="STORAGE_PROVIDER")
    local_storage_path: str = Field(default="./data/storage", alias="LOCAL_STORAGE_PATH")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    # Dev login is wired in T-011; flag lives here so compose can set it early.
    dev_login: bool = Field(default=False, alias="DEV_LOGIN")

    @property
    def is_dev(self) -> bool:
        return self.env.lower() == "dev"

    @property
    def is_test(self) -> bool:
        return self.env.lower() == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
