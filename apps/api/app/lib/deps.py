from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.errors import api_error
from app.lib.security import decode_access_token
from app.models.admin import AdminUser
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthUser:
    id: int
    email: str
    role: str | None = None
    is_admin: bool = False


async def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Header(alias="X-Access-Token")] = None,
    db: AsyncSession = Depends(get_db_session),
) -> AuthUser | None:
    raw = None
    if creds and creds.credentials:
        raw = creds.credentials
    elif authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1]
    elif token:
        raw = token
    if not raw:
        return None
    payload = decode_access_token(raw)
    if not payload:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    kind, _, ident = sub.partition(":")
    if kind == "user":
        result = await db.execute(select(User).where(User.id == int(ident), User.status == "active"))
        user = result.scalar_one_or_none()
        if not user:
            return None
        return AuthUser(id=user.id, email=user.email, role="user")
    if kind == "admin":
        result = await db.execute(
            select(AdminUser).where(AdminUser.id == int(ident), AdminUser.status == "active")
        )
        admin = result.scalar_one_or_none()
        if not admin:
            return None
        return AuthUser(id=admin.id, email=admin.email, role=admin.role, is_admin=True)
    return None


async def require_user(user: Annotated[AuthUser | None, Depends(get_optional_user)]) -> AuthUser:
    if not user or user.is_admin:
        raise api_error("UNAUTHORIZED", "로그인이 필요합니다.", 401)
    return user


async def require_admin(user: Annotated[AuthUser | None, Depends(get_optional_user)]) -> AuthUser:
    if not user or not user.is_admin:
        raise api_error("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401)
    if user.role == "readonly":
        raise api_error("FORBIDDEN", "읽기 전용 계정입니다.", 403)
    return user


async def require_any_admin(user: Annotated[AuthUser | None, Depends(get_optional_user)]) -> AuthUser:
    if not user or not user.is_admin:
        raise api_error("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401)
    return user
