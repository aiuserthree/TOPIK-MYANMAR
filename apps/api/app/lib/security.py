from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def hash_code(code: str) -> str:
    return hash_password(code)


def verify_code(code: str, code_hash: str) -> bool:
    return verify_password(code, code_hash)


def _exp(minutes: int = 0, days: int = 0) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=minutes, days=days)


def create_access_token(subject: str, claims: dict[str, Any]) -> str:
    payload = {
        "sub": subject,
        "typ": "access",
        "exp": _exp(minutes=settings.jwt_access_ttl_minutes),
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_refresh_token(subject: str, claims: dict[str, Any]) -> str:
    payload = {
        "sub": subject,
        "typ": "refresh",
        "exp": _exp(days=settings.jwt_refresh_ttl_days),
        **claims,
    }
    return jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if data.get("typ") != "access":
            return None
        return data
    except JWTError:
        return None


def decode_refresh_token(token: str) -> dict[str, Any] | None:
    try:
        data = jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
        if data.get("typ") != "refresh":
            return None
        return data
    except JWTError:
        return None


def create_email_verify_token(email: str) -> str:
    return jwt.encode(
        {"typ": "email_verify", "email": email, "exp": _exp(minutes=30)},
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_email_verify_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if data.get("typ") != "email_verify" or not data.get("email"):
            return None
        return str(data["email"])
    except JWTError:
        return None
