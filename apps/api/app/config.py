from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings for local dev and VPS deployment."""

    database_url: str = Field(
        default="postgresql+asyncpg://topik_app:change_me@127.0.0.1:5432/topik_myanmar",
        validation_alias="DATABASE_URL",
    )
    jwt_secret: str = Field(default="change-me", validation_alias="JWT_SECRET")
    cors_origins_raw: str = Field(
        default="http://localhost:5173",
        validation_alias="CORS_ORIGINS",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins_raw.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
