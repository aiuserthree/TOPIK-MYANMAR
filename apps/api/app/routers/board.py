from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.deps import AuthUser, require_complete_user
from app.lib.errors import api_error
from app.lib.email_notify import (
    notify_board_activity_to_operator,
    notify_board_post_created,
    resolve_admin_notify_email,
)
from app.lib.board_helpers import (
    build_comment_tree,
    filter_visible_comments,
    official_replies_for_post,
    parse_parent_comment_id,
    resolve_comment_is_secret,
)
from app.lib.formatting import board_status_label, fmt_date, fmt_datetime
from app.lib.locale import resolve_request_locale
from app.lib.security import hash_password, verify_password
from app.lib.storage import save_upload
from app.models.admin import AdminUser
from app.models.board import BoardComment, BoardPost
from app.models.system import FileAttachment
from app.models.user import User

router = APIRouter(prefix="/board", tags=["board"])

PAGE_SIZE = 20
SECRET_MAX_FAIL = 5
SECRET_LOCK_MINUTES = 30

# 게시판 첨부 허용 형식 (계약서 6.1: jpg/png/pdf ≤5MB)
_ALLOWED_ATTACH = {
    "image/jpeg": (".jpg", ".jpeg"),
    "image/png": (".png",),
    "application/pdf": (".pdf",),
}
_ATTACH_OWNER_PENDING = "board_attachment"
_ATTACH_OWNER_POST = "board_post"


class CreatePostBody(BaseModel):
    board_type: str
    title: str
    body: str
    category: str | None = None
    post_type: str | None = None
    is_secret: bool = False
    secret_password: str | None = None
    attachment_file_ids: list[int] = []


class CreateCommentBody(BaseModel):
    body: str
    parent_comment_id: int | None = None


class UnlockBody(BaseModel):
    password: str


class UpdatePostBody(BaseModel):
    title: str | None = None
    body: str | None = None
    category: str | None = None
    post_type: str | None = None
    is_secret: bool | None = None
    secret_password: str | None = None


def _default_workflow(board_type: str) -> str:
    return "awaiting_reply" if board_type == "inquiry" else "received"


def _is_locked_secret(post: BoardPost, auth: AuthUser) -> bool:
    """비밀글이고 본인 글이 아닌 경우 잠김(목록/상세에서 본문 비노출)."""
    return bool(post.is_secret) and post.user_id != auth.id


def _can_author_edit(post: BoardPost, auth: AuthUser) -> bool:
    return post.user_id == auth.id and not post.admin_reply


def _author_display(is_mine: bool, author_name: str | None, lang: str) -> str:
    if is_mine:
        if lang == "my":
            return "ကိုယ်တိုင်"
        if lang == "en":
            return "Me"
        return "본인"
    return author_name or "—"


def _post_list_item(post: BoardPost, author_name: str | None, auth: AuthUser, lang: str = "ko") -> dict:
    is_mine = post.user_id == auth.id
    locked = _is_locked_secret(post, auth)
    return {
        "id": post.id,
        "board_type": post.board_type,
        "category": post.category,
        "post_type": post.post_type,
        "title": post.title,
        "is_secret": post.is_secret,
        "is_mine": is_mine,
        "locked": locked,
        "is_secret_to_viewer": locked,
        "author_name": _author_display(is_mine, author_name, lang),
        "workflow_status": post.workflow_status,
        "status_label": board_status_label(post.workflow_status, lang),
        "has_admin_reply": bool(post.admin_reply),
        "can_edit": _can_author_edit(post, auth),
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "date_formatted": fmt_date(post.created_at),
    }


async def _attachments_for_post(db: AsyncSession, post_id: int) -> list[dict]:
    res = await db.execute(
        select(FileAttachment).where(
            FileAttachment.owner_type == _ATTACH_OWNER_POST,
            FileAttachment.owner_id == post_id,
        )
    )
    return [
        {
            "file_id": f.id,
            "filename": f.original_filename or "file",
            "size": f.size_bytes,
            "url": f"/api/v1/files/{f.id}",
        }
        for f in res.scalars().all()
    ]


async def _full_post_dict(
    db: AsyncSession,
    post: BoardPost,
    author_name: str | None,
    auth: AuthUser,
    attachments: list[dict],
    lang: str = "ko",
) -> dict:
    is_mine = post.user_id == auth.id
    admin_replies = await official_replies_for_post(db, post)
    latest = admin_replies[-1] if admin_replies else None
    return {
        "id": post.id,
        "board_type": post.board_type,
        "category": post.category,
        "post_type": post.post_type,
        "title": post.title,
        "body": post.body,
        "is_secret": post.is_secret,
        "is_mine": is_mine,
        "locked": False,
        "author_name": _author_display(is_mine, author_name, lang) if is_mine else (author_name or "—"),
        "workflow_status": post.workflow_status,
        "status_label": board_status_label(post.workflow_status, lang),
        "admin_reply": latest["body"] if latest else post.admin_reply,
        "admin_replied_at": latest["created_at"] if latest else (
            post.admin_replied_at.isoformat() if post.admin_replied_at else None
        ),
        "admin_replies": admin_replies,
        "has_admin_reply": bool(admin_replies or post.admin_reply),
        "can_edit": _can_author_edit(post, auth),
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "date_formatted": fmt_date(post.created_at),
        "attachments": attachments,
    }


@router.get("/posts")
async def list_posts(
    request: Request,
    board_type: str = Query(...),
    page: int = Query(1, ge=1),
    lang: str | None = Query(None),
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    locale = resolve_request_locale(request, lang)
    # 일반글은 누구나 열람(목록 노출). 비밀글은 목록엔 노출하되 본문 잠금.
    total = (
        await db.execute(
            select(func.count())
            .select_from(BoardPost)
            .where(BoardPost.board_type == board_type)
        )
    ).scalar() or 0

    result = await db.execute(
        select(BoardPost, User)
        .join(User, User.id == BoardPost.user_id)
        .where(BoardPost.board_type == board_type)
        .order_by(BoardPost.created_at.desc(), BoardPost.id.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    )
    rows = result.all()
    items = [_post_list_item(post, user.name_ko, auth, locale) for post, user in rows]
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    return {
        "items": items,
        "page": page,
        "pagination": {
            "page": page,
            "page_size": PAGE_SIZE,
            "total_items": total,
            "total_pages": total_pages,
        },
    }


async def _load_post_with_author(db: AsyncSession, post_id: int):
    res = await db.execute(
        select(BoardPost, User).join(User, User.id == BoardPost.user_id).where(BoardPost.id == post_id)
    )
    row = res.first()
    if not row:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    return row  # (post, user)


@router.get("/posts/{post_id}")
async def get_post(
    request: Request,
    post_id: int,
    lang: str | None = Query(None),
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    locale = resolve_request_locale(request, lang)
    post, user = await _load_post_with_author(db, post_id)
    if _is_locked_secret(post, auth):
        # 잠긴 비밀글: 본문 비노출. unlock 으로 열람.
        return {
            "id": post.id,
            "board_type": post.board_type,
            "category": post.category,
            "post_type": post.post_type,
            "title": post.title,
            "is_secret": True,
            "is_mine": False,
            "locked": True,
            "author_name": user.name_ko,
            "workflow_status": post.workflow_status,
            "status_label": board_status_label(post.workflow_status, locale),
            "date_formatted": fmt_date(post.created_at),
        }
    attachments = await _attachments_for_post(db, post_id)
    return await _full_post_dict(db, post, user.name_ko, auth, attachments, locale)


@router.post("/posts")
async def create_post(
    body: CreatePostBody,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    # 비밀번호는 선택: 미입력 시 작성자·관리자만 열람(비밀번호 unlock 불가).
    post = BoardPost(
        board_type=body.board_type,
        user_id=auth.id,
        category=body.category,
        post_type=body.post_type,
        title=body.title.strip(),
        body=body.body.strip(),
        is_secret=body.is_secret,
        secret_password_hash=hash_password(body.secret_password)
        if body.is_secret and body.secret_password
        else None,
        workflow_status=_default_workflow(body.board_type),
    )
    db.add(post)
    await db.flush()

    # 첨부파일 연결: 본인이 업로드한 pending 첨부만 이 글에 귀속.
    if body.attachment_file_ids:
        att_res = await db.execute(
            select(FileAttachment).where(
                FileAttachment.id.in_(body.attachment_file_ids),
                FileAttachment.owner_type == _ATTACH_OWNER_PENDING,
                FileAttachment.owner_id == auth.id,
            )
        )
        for f in att_res.scalars().all():
            f.owner_type = _ATTACH_OWNER_POST
            f.owner_id = post.id

    user = (await db.execute(select(User).where(User.id == auth.id))).scalar_one_or_none()
    if user:
        admin_email = await resolve_admin_notify_email(db)
        await notify_board_post_created(db, post, user, admin_email=admin_email)
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "workflow_status": post.workflow_status, "message": "접수되었습니다."}


@router.patch("/posts/{post_id}")
async def update_post(
    post_id: int,
    body: UpdatePostBody,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post, user = await _load_post_with_author(db, post_id)
    if not _can_author_edit(post, auth):
        raise api_error("FORBIDDEN", "답변이 등록된 글은 수정할 수 없습니다.", 403)
    data = body.model_dump(exclude_unset=True)
    secret_password = data.pop("secret_password", None)
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title or len(title) > 100:
            raise api_error("VALIDATION_ERROR", "제목을 100자 이내로 입력해 주세요.", 400)
        post.title = title
    if "body" in data:
        content = (data["body"] or "").strip()
        if not content or len(content) < 10:
            raise api_error("VALIDATION_ERROR", "내용을 10자 이상 입력해 주세요.", 400)
        post.body = content
    if "category" in data:
        post.category = data["category"]
    if "post_type" in data:
        post.post_type = data["post_type"]
    if "is_secret" in data and data["is_secret"] is not None:
        post.is_secret = bool(data["is_secret"])
    if secret_password is not None:
        pw = secret_password.strip()
        if post.is_secret and pw:
            if len(pw) < 4:
                raise api_error("VALIDATION_ERROR", "비밀글 비밀번호를 4자 이상 입력해 주세요.", 400)
            post.secret_password_hash = hash_password(pw)
        elif not pw:
            post.secret_password_hash = None
    await db.commit()
    attachments = await _attachments_for_post(db, post_id)
    data = await _full_post_dict(db, post, user.name_ko, auth, attachments)
    data["message"] = "수정되었습니다."
    return data


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post, _ = await _load_post_with_author(db, post_id)
    if not _can_author_edit(post, auth):
        raise api_error("FORBIDDEN", "답변이 등록된 글은 삭제할 수 없습니다.", 403)
    await db.delete(post)
    await db.commit()
    return {"deleted": True, "message": "삭제되었습니다."}


@router.post("/attachments")
async def upload_attachment(
    file: UploadFile = File(...),
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    content_type = (file.content_type or "").lower()
    filename = file.filename or "file"
    ext_ok = any(filename.lower().endswith(ext) for exts in _ALLOWED_ATTACH.values() for ext in exts)
    if content_type not in _ALLOWED_ATTACH and not ext_ok:
        raise api_error("INVALID_FILE_TYPE", "jpg, png, pdf 파일만 업로드할 수 있습니다.")
    data = await file.read()
    # MIME 미확정 시 확장자로 보정.
    if content_type not in _ALLOWED_ATTACH:
        lower = filename.lower()
        if lower.endswith(".png"):
            content_type = "image/png"
        elif lower.endswith(".pdf"):
            content_type = "application/pdf"
        else:
            content_type = "image/jpeg"
    try:
        row = await save_upload(
            db,
            owner_type=_ATTACH_OWNER_PENDING,
            owner_id=auth.id,
            data=data,
            mime_type=content_type,
            original_filename=filename,
        )
    except ValueError as exc:
        msg = "5MB 이하의 파일만 업로드할 수 있습니다." if str(exc) == "file_too_large" else "파일을 업로드할 수 없습니다."
        raise api_error("FILE_TOO_LARGE", msg) from exc
    await db.commit()
    return {
        "body": {
            "file_id": row.id,
            "filename": row.original_filename,
            "size": row.size_bytes,
            "content_type": row.mime_type,
        },
        "file_id": row.id,
        "filename": row.original_filename,
        "size": row.size_bytes,
        "content_type": row.mime_type,
    }


@router.post("/posts/{post_id}/unlock")
async def unlock_post(
    post_id: int,
    body: UnlockBody,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post, user = await _load_post_with_author(db, post_id)
    # 본인 글/일반글은 잠금 없음.
    if not _is_locked_secret(post, auth):
        attachments = await _attachments_for_post(db, post_id)
        return await _full_post_dict(db, post, user.name_ko, auth, attachments)

    # 비밀번호가 설정되지 않은 비밀글은 작성자·관리자만 열람 가능(unlock 불가).
    if not post.secret_password_hash:
        raise api_error("FORBIDDEN", "작성자만 열람할 수 있는 비밀글입니다.", 403)

    now = datetime.now(timezone.utc)
    if post.secret_locked_until and post.secret_locked_until > now:
        raise api_error("LOCKED", "비밀번호 입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.", 423)

    if verify_password(body.password, post.secret_password_hash):
        post.secret_fail_count = 0
        post.secret_locked_until = None
        await db.commit()
        attachments = await _attachments_for_post(db, post_id)
        data = await _full_post_dict(db, post, user.name_ko, auth, attachments)
        data["unlocked"] = True
        return data

    post.secret_fail_count = (post.secret_fail_count or 0) + 1
    remaining = SECRET_MAX_FAIL - post.secret_fail_count
    if post.secret_fail_count >= SECRET_MAX_FAIL:
        post.secret_locked_until = now + timedelta(minutes=SECRET_LOCK_MINUTES)
        post.secret_fail_count = 0
        await db.commit()
        raise api_error("LOCKED", f"비밀번호 {SECRET_MAX_FAIL}회 오류로 {SECRET_LOCK_MINUTES}분간 잠겼습니다.", 423)
    await db.commit()
    raise api_error("INVALID_PASSWORD", f"비밀번호가 올바르지 않습니다. (남은 시도 {max(0, remaining)}회)", 400)


@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: int,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post, _ = await _load_post_with_author(db, post_id)
    if _is_locked_secret(post, auth):
        raise api_error("FORBIDDEN", "비밀글입니다. 작성자만 열람할 수 있습니다.", 403)

    result = await db.execute(
        select(BoardComment)
        .where(BoardComment.board_post_id == post_id, BoardComment.is_deleted.is_(False))
        .order_by(BoardComment.created_at, BoardComment.id)
    )
    comments = result.scalars().all()
    comments = filter_visible_comments(comments, post, auth.id)

    user_ids = {c.author_user_id for c in comments if c.author_user_id}
    admin_ids = {c.author_admin_id for c in comments if c.author_admin_id}
    users: dict[int, str] = {}
    admins: dict[int, str] = {}
    if user_ids:
        ures = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u.name_ko for u in ures.scalars().all()}
    if admin_ids:
        ares = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a.name for a in ares.scalars().all()}

    def author_for(c: BoardComment) -> str | None:
        if c.author_admin_id:
            return admins.get(c.author_admin_id) or "관리자"
        if c.author_user_id:
            return users.get(c.author_user_id)
        return None

    roots = build_comment_tree(comments, author_for=author_for)
    return {"comments": roots, "items": roots}


@router.post("/posts/{post_id}/comments")
async def create_comment(
    post_id: int,
    body: CreateCommentBody,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post, _ = await _load_post_with_author(db, post_id)
    if _is_locked_secret(post, auth):
        raise api_error("FORBIDDEN", "비밀글입니다. 작성자만 댓글을 작성할 수 있습니다.", 403)
    content = body.body.strip()
    if not content:
        raise api_error("VALIDATION_ERROR", "댓글 내용을 입력해 주세요.")
    parent_id = parse_parent_comment_id(body.parent_comment_id)
    if body.parent_comment_id is not None and parent_id is None:
        raise api_error("VALIDATION_ERROR", "parent_comment_id가 올바르지 않습니다.", 400)
    comment = BoardComment(
        board_post_id=post_id,
        author_user_id=auth.id,
        body=content,
        parent_comment_id=parent_id,
        is_secret=bool(post.is_secret),
    )
    db.add(comment)
    commenter = (await db.execute(select(User).where(User.id == auth.id))).scalar_one_or_none()
    if commenter:
        parent_label = "대댓글" if parent_id else "댓글"
        await notify_board_activity_to_operator(
            db,
            post,
            activity_type=f"회원 {parent_label}",
            actor_name=commenter.name_ko,
        )
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "created_at": comment.created_at.isoformat()}
