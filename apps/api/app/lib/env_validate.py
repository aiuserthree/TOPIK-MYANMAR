from __future__ import annotations

from app.config import get_settings
from app.lib.storage import validate_storage_settings

WEAK_JWT_SECRETS = frozenset(
    {
        "change-me",
        "change-me-refresh",
        "change-this-to-a-long-random-secret",
        "change-this-to-another-long-random-secret",
    }
)


def validate_runtime_settings() -> None:
    """Fail fast on unsafe production configuration (S3, JWT, etc.)."""
    validate_storage_settings()
    settings = get_settings()
    if settings.is_development or settings.debug:
        return
    if settings.jwt_secret in WEAK_JWT_SECRETS or len(settings.jwt_secret) < 32:
        raise RuntimeError(
            "APP_ENV=production requires JWT_SECRET to be a strong random string (32+ chars)"
        )
    if settings.jwt_refresh_secret in WEAK_JWT_SECRETS or len(settings.jwt_refresh_secret) < 32:
        raise RuntimeError(
            "APP_ENV=production requires JWT_REFRESH_SECRET to be a strong random string (32+ chars)"
        )
