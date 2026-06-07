from __future__ import annotations

from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = Field(default="development", validation_alias="APP_ENV")
    debug: bool = Field(default=False, validation_alias="DEBUG")
    database_url: str = Field(
        default="postgresql+asyncpg://topik_app:change_me@127.0.0.1:5432/topik_myanmar",
        validation_alias="DATABASE_URL",
    )
    jwt_secret: str = Field(default="change-me", validation_alias="JWT_SECRET")
    jwt_refresh_secret: str = Field(default="change-me-refresh", validation_alias="JWT_REFRESH_SECRET")
    jwt_access_ttl_minutes: int = Field(default=60, validation_alias="JWT_ACCESS_TTL_MINUTES")
    jwt_refresh_ttl_days: int = Field(default=14, validation_alias="JWT_REFRESH_TTL_DAYS")
    cors_origins_raw: str = Field(
        default=(
            "http://localhost:5173,http://localhost:8080,http://localhost:8081,"
            "http://127.0.0.1:8080,http://127.0.0.1:8081,"
            "https://www.topik-myanmar.com,https://admin.topik-myanmar.com"
        ),
        validation_alias="CORS_ORIGINS",
    )
    storage_provider: str = Field(default="local", validation_alias="STORAGE_PROVIDER")
    upload_dir: str = Field(default="var/uploads", validation_alias="UPLOAD_DIR")
    upload_max_bytes: int = Field(default=5_242_880, validation_alias="UPLOAD_MAX_BYTES")
    s3_bucket: str = Field(default="", validation_alias="S3_BUCKET")
    s3_region: str = Field(default="kr-standard", validation_alias="S3_REGION")
    s3_access_key: str = Field(default="", validation_alias="S3_ACCESS_KEY")
    s3_secret: str = Field(default="", validation_alias="S3_SECRET")
    s3_endpoint: str = Field(default="https://kr.object.iwinv.kr", validation_alias="S3_ENDPOINT")
    s3_prefix: str = Field(default="photos", validation_alias="S3_PREFIX")
    mail_provider: str = Field(default="console", validation_alias="MAIL_PROVIDER")
    mail_from: str = Field(default="noreply@topik-myanmar.com", validation_alias="MAIL_FROM")
    resend_api_key: str = Field(default="", validation_alias="RESEND_API_KEY")
    smtp_host: str = Field(default="mail.topik-myanmar.com", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_secure: bool = Field(default=False, validation_alias="SMTP_SECURE")
    smtp_user: str = Field(default="", validation_alias="SMTP_USER")
    smtp_pass: str = Field(default="", validation_alias="SMTP_PASS")
    enable_email_worker: bool = Field(default=False, validation_alias="ENABLE_EMAIL_WORKER")
    public_fo_base: str = Field(default="https://www.topik-myanmar.com", validation_alias="PUBLIC_FO_BASE")
    min_signup_age_years: int = Field(default=14, validation_alias="MIN_SIGNUP_AGE_YEARS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def cors_allow_localhost(self) -> bool:
        return self.is_development or self.debug

    @property
    def s3_enabled(self) -> bool:
        return self.storage_provider.lower() == "s3"

    @property
    def s3_configured(self) -> bool:
        return bool(self.s3_bucket and self.s3_access_key and self.s3_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
