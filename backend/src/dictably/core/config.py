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
    # Dev login: only honored when ENV is dev or test (never prod).
    dev_login: bool = Field(default=False, alias="DEV_LOGIN")

    session_ttl_days: int = Field(default=30, alias="SESSION_TTL_DAYS")
    cookie_secure: bool | None = Field(default=None, alias="COOKIE_SECURE")
    public_app_url: str = Field(default="http://127.0.0.1:3000", alias="PUBLIC_APP_URL")
    # How many rightmost X-Forwarded-For hops are trusted proxies (0 = use socket peer only).
    trusted_proxy_hops: int = Field(default=0, alias="TRUSTED_PROXY_HOPS")

    google_client_id: str = Field(default="", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(
        default="http://127.0.0.1:8000/api/auth/google/callback",
        alias="GOOGLE_REDIRECT_URI",
    )

    auth_rate_limit_per_minute: int = Field(default=30, alias="AUTH_RATE_LIMIT_PER_MINUTE")

    @property
    def is_dev(self) -> bool:
        return self.env.lower() == "dev"

    @property
    def is_test(self) -> bool:
        return self.env.lower() == "test"

    @property
    def is_prod(self) -> bool:
        return self.env.lower() == "prod"

    @property
    def dev_login_enabled(self) -> bool:
        return self.dev_login and (self.is_dev or self.is_test)

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.google_client_id.strip() and self.google_client_secret.strip())

    @property
    def cookies_secure(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.is_prod


@lru_cache
def get_settings() -> Settings:
    return Settings()
