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
    # R2 / S3-compatible (T-038). When STORAGE_PROVIDER=r2|s3, browser uses presigned PUT.
    s3_endpoint_url: str = Field(default="", alias="S3_ENDPOINT_URL")
    # Browser-facing endpoint for presigned URLs (B7). Empty → same as S3_ENDPOINT_URL.
    # Dev compose: internal http://minio:9000 + S3_PRESIGN_ENDPOINT_URL=http://127.0.0.1:9000
    s3_presign_endpoint_url: str = Field(default="", alias="S3_PRESIGN_ENDPOINT_URL")
    s3_access_key_id: str = Field(default="", alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: str = Field(default="", alias="S3_SECRET_ACCESS_KEY")
    s3_bucket: str = Field(default="", alias="S3_BUCKET")
    s3_region: str = Field(default="auto", alias="S3_REGION")
    # Originals deleted after N days once playback copy exists (0 = keep forever).
    original_retention_days: int = Field(default=30, alias="ORIGINAL_RETENTION_DAYS")
    # Fair queue (T-038): concurrent process_media jobs per user.
    fair_queue_limit_free: int = Field(default=1, alias="FAIR_QUEUE_LIMIT_FREE")
    fair_queue_limit_elevated: int = Field(default=2, alias="FAIR_QUEUE_LIMIT_ELEVATED")
    fair_queue_treat_all_elevated: bool = Field(
        default=False, alias="FAIR_QUEUE_TREAT_ALL_ELEVATED"
    )
    # Ops alerts (T-038): email when queue or error rate crosses thresholds.
    alert_email: str = Field(default="", alias="ALERT_EMAIL")
    alert_queue_threshold: int = Field(default=20, alias="ALERT_QUEUE_THRESHOLD")
    alert_error_rate_pct: float = Field(default=25.0, alias="ALERT_ERROR_RATE_PCT")
    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="alerts@dictably.app", alias="SMTP_FROM")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    # Dev login: only honored when ENV is dev or test (never prod).
    dev_login: bool = Field(default=False, alias="DEV_LOGIN")
    # Run process_media in-process after upload (e2e / single-process local).
    inline_media_process: bool = Field(default=False, alias="INLINE_MEDIA_PROCESS")
    assemblyai_api_key: str = Field(default="", alias="ASSEMBLYAI_API_KEY")
    asr_fallback: str = Field(default="assemblyai", alias="ASR_FALLBACK")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-haiku-5-5", alias="ANTHROPIC_MODEL")
    # AssemblyAI LLM Gateway (T-016a): model id from their Available models page.
    assemblyai_llm_model: str = Field(default="claude-haiku-5-5", alias="ASSEMBLYAI_LLM_MODEL")
    # eu keeps data in EU (Claude/Gemini); us for OpenAI-only models.
    assemblyai_llm_region: str = Field(default="eu", alias="ASSEMBLYAI_LLM_REGION")
    # MVP-0 trial budget per user (N2); PRODUCT later may use 60 min / file.
    trial_seconds: int = Field(default=3 * 60 * 60, alias="TRIAL_SECONDS")

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
