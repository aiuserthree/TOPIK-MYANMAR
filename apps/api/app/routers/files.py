from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.deps import AuthUser, get_optional_user, require_any_admin
from app.lib.errors import api_error
from app.lib.security import decode_access_token
from app.lib.storage import get_file_row, resolve_local_path
from app.models.application import Application
from app.models.user import User

router = APIRouter(tags=["files"])


async def _authorize_file(
    file_id: int,
    user: AuthUser | None,
    token: str | None,
    db: AsyncSession,
) -> tuple:
    auth = user
    if not auth and token:
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            sub = str(payload["sub"])
            kind, _, ident = sub.partition(":")
            auth = AuthUser(id=int(ident), email=payload.get("email", ""), role=payload.get("role"), is_admin=kind == "admin")
    if not auth:
        raise api_error("UNAUTHORIZED", "인증이 필요합니다.", 401)
    row = await get_file_row(db, file_id)
    if not row:
        raise api_error("FILE_UNAVAILABLE", "파일을 찾을 수 없습니다.", 404)
    if auth.is_admin:
        return row, auth
    if row.owner_type == "user_photo" and row.owner_id == auth.id:
        return row, auth
    if row.owner_type == "application_photo":
        app_res = await db.execute(
            select(Application).where(Application.id == row.owner_id, Application.user_id == auth.id)
        )
        if app_res.scalar_one_or_none():
            return row, auth
    user_res = await db.execute(select(User).where(User.id == auth.id))
    u = user_res.scalar_one_or_none()
    if u and u.photo_file_id == file_id:
        return row, auth
    raise api_error("FORBIDDEN", "파일 접근 권한이 없습니다.", 403)


@router.get("/files/{file_id}")
async def get_file(
    file_id: int,
    token: str | None = Query(None),
    user: AuthUser | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db_session),
):
    row, _ = await _authorize_file(file_id, user, token, db)
    path = resolve_local_path(row.storage_key)
    if not path:
        raise api_error("FILE_UNAVAILABLE", "파일을 사용할 수 없습니다.", 404)
    return FileResponse(path, media_type=row.mime_type, filename=row.original_filename or "file")


@router.get("/admin/files/{file_id}")
async def get_admin_file(
    file_id: int,
    token: str | None = Query(None),
    admin: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
):
    row, _ = await _authorize_file(file_id, admin, token, db)
    path = resolve_local_path(row.storage_key)
    if not path:
        raise api_error("FILE_UNAVAILABLE", "파일을 사용할 수 없습니다.", 404)
    return FileResponse(path, media_type=row.mime_type, filename=row.original_filename or "file")
