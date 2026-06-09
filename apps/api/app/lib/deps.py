from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.errors import api_error
from app.lib.profile import AUTH_USER_STATUSES, is_profile_incomplete
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
    must_change_password: bool = False


def get_client_ip(request: Request) -> str | None:
    """X-Forwarded-For(프록시) → request.client 순으로 클라이언트 IP 추출."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


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
        result = await db.execute(
            select(User).where(User.id == int(ident), User.status.in_(AUTH_USER_STATUSES))
        )
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
        return AuthUser(
            id=admin.id,
            email=admin.email,
            role=admin.role,
            is_admin=True,
            must_change_password=admin.must_change_password,
        )
    return None


async def require_user(user: Annotated[AuthUser | None, Depends(get_optional_user)]) -> AuthUser:
    if not user or user.is_admin:
        raise api_error("UNAUTHORIZED", "로그인이 필요합니다.", 401)
    return user


async def require_complete_user(
    auth: Annotated[AuthUser, Depends(require_user)],
    db: AsyncSession = Depends(get_db_session),
) -> AuthUser:
    result = await db.execute(
        select(User).where(User.id == auth.id, User.status.in_(AUTH_USER_STATUSES))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "사용자를 찾을 수 없습니다.", 404)
    if is_profile_incomplete(user):
        raise api_error("PROFILE_INCOMPLETE", "회원가입을 완료해 주세요.", 403)
    return auth


def _guard_must_change(user: AuthUser) -> None:
    # 첫 로그인 비밀번호 변경 강제: 변경 전 다른 기능 차단(계약서 7절).
    if user.must_change_password:
        raise api_error(
            "PASSWORD_CHANGE_REQUIRED",
            "최초 로그인 시 비밀번호를 변경해야 합니다.",
            403,
        )


async def require_admin_base(
    user: Annotated[AuthUser | None, Depends(get_optional_user)],
) -> AuthUser:
    """관리자 인증만 확인(권한등급·비번변경 게이팅 없음). 비밀번호 변경 엔드포인트 전용."""
    if not user or not user.is_admin:
        raise api_error("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401)
    return user


async def require_admin(user: Annotated[AuthUser | None, Depends(get_optional_user)]) -> AuthUser:
    if not user or not user.is_admin:
        raise api_error("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401)
    if user.role == "readonly":
        raise api_error("FORBIDDEN", "읽기 전용 계정입니다.", 403)
    _guard_must_change(user)
    return user


async def require_any_admin(user: Annotated[AuthUser | None, Depends(get_optional_user)]) -> AuthUser:
    if not user or not user.is_admin:
        raise api_error("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401)
    _guard_must_change(user)
    return user


async def require_super(user: Annotated[AuthUser | None, Depends(require_admin)]) -> AuthUser:
    if user.role != "super":
        raise api_error("FORBIDDEN", "최고관리자만 수행할 수 있습니다.", 403)
    return user
