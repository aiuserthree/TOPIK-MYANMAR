from __future__ import annotations

import io
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.deps import AuthUser, get_optional_user
from app.lib.errors import api_error, fo_api_error
from app.lib.locale import resolve_request_locale
from app.lib.security import decode_access_token
from app.lib.storage import get_file_row, read_file_bytes, resolve_local_path
from app.models.application import Application
from app.models.content import Notice
from app.models.user import User
from app.routers.content import _notice_display_window_clause, _notice_visible_now

router = APIRouter(tags=["files"])


async def _notice_is_public(db: AsyncSession, notice_id: int | None) -> bool:
    if notice_id is None:
        return False
    now = _notice_visible_now()
    res = await db.execute(
        select(Notice.id).where(
            Notice.id == notice_id,
            Notice.is_published.is_(True),
            *_notice_display_window_clause(now),
        )
    )
    return res.scalar_one_or_none() is not None


async def _authorize_file(
    file_id: int,
    user: AuthUser | None,
    token: str | None,
    db: AsyncSession,
    lang: str | None = None,
) -> tuple:
    auth = user
    if not auth and token:
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            sub = str(payload["sub"])
            kind, _, ident = sub.partition(":")
            auth = AuthUser(id=int(ident), email=payload.get("email", ""), role=payload.get("role"), is_admin=kind == "admin")
    row = await get_file_row(db, file_id)
    # 공지 첨부·본문 이미지는 공지가 FO에 노출 중이면 비로그인도 받을 수 있다.
    if row and row.owner_type == "notice" and await _notice_is_public(db, row.owner_id):
        return row, auth
    if not auth:
        raise fo_api_error("UNAUTHORIZED", "file_unauthorized", lang, 401)
    if not row:
        raise fo_api_error("FILE_UNAVAILABLE", "file_not_found", lang, 404)
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
    raise fo_api_error("FORBIDDEN", "file_forbidden", lang, 403)


def _content_disposition(filename: str, disposition: str = "inline") -> str:
    ascii_name = "".join(c if ord(c) < 128 else "_" for c in filename) or "file"
    return f'{disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'


def _file_response(row, lang: str | None = None) -> FileResponse | StreamingResponse:
    filename = row.original_filename or "file"
    headers = {"Content-Disposition": _content_disposition(filename, "inline")}

    path = resolve_local_path(row.storage_key)
    if path:
        return FileResponse(path, media_type=row.mime_type, headers=headers)

    data = read_file_bytes(row.storage_key)
    if not data:
        raise fo_api_error("FILE_UNAVAILABLE", "file_unavailable", lang, 404)

    return StreamingResponse(io.BytesIO(data), media_type=row.mime_type, headers=headers)


@router.get("/files/{file_id}")
async def get_file(
    request: Request,
    file_id: int,
    token: str | None = Query(None),
    user: AuthUser | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db_session),
):
    lang = resolve_request_locale(request)
    row, _ = await _authorize_file(file_id, user, token, db, lang=lang)
    return _file_response(row, lang=lang)


@router.get("/admin/files/{file_id}")
async def get_admin_file(
    file_id: int,
    token: str | None = Query(None),
    admin: AuthUser | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db_session),
):
    row, auth = await _authorize_file(file_id, admin, token, db)
    if not auth or not auth.is_admin:
        raise api_error("FORBIDDEN", "관리자 파일 접근 권한이 없습니다.", 403)
    return _file_response(row)
