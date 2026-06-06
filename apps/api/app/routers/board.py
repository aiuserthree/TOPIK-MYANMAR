from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.deps import AuthUser, require_user
from app.lib.errors import api_error
from app.lib.security import hash_password
from app.models.board import BoardComment, BoardPost

router = APIRouter(prefix="/board", tags=["board"])


class CreatePostBody(BaseModel):
    board_type: str
    title: str
    body: str
    category: str | None = None
    post_type: str | None = None
    is_secret: bool = False
    secret_password: str | None = None


class CreateCommentBody(BaseModel):
    body: str
    parent_comment_id: int | None = None


def _default_workflow(board_type: str) -> str:
    return "awaiting_reply" if board_type == "inquiry" else "received"


@router.get("/posts")
async def list_posts(
    board_type: str = Query(...),
    page: int = Query(1, ge=1),
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(BoardPost)
        .where(BoardPost.board_type == board_type, BoardPost.user_id == auth.id)
        .order_by(BoardPost.created_at.desc())
        .offset((page - 1) * 20)
        .limit(20)
    )
    items = [
        {
            "id": p.id,
            "title": p.title,
            "workflow_status": p.workflow_status,
            "created_at": p.created_at.isoformat(),
            "has_admin_reply": bool(p.admin_reply),
        }
        for p in result.scalars().all()
    ]
    return {"items": items, "page": page}


@router.get("/posts/{post_id}")
async def get_post(
    post_id: int,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(BoardPost).where(BoardPost.id == post_id, BoardPost.user_id == auth.id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    return {
        "id": post.id,
        "board_type": post.board_type,
        "title": post.title,
        "body": post.body,
        "workflow_status": post.workflow_status,
        "admin_reply": post.admin_reply,
        "admin_replied_at": post.admin_replied_at.isoformat() if post.admin_replied_at else None,
        "created_at": post.created_at.isoformat(),
    }


@router.post("/posts")
async def create_post(
    body: CreatePostBody,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = BoardPost(
        board_type=body.board_type,
        user_id=auth.id,
        category=body.category,
        post_type=body.post_type,
        title=body.title.strip(),
        body=body.body.strip(),
        is_secret=body.is_secret,
        secret_password_hash=hash_password(body.secret_password) if body.is_secret and body.secret_password else None,
        workflow_status=_default_workflow(body.board_type),
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "workflow_status": post.workflow_status}


@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: int,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post_res = await db.execute(select(BoardPost).where(BoardPost.id == post_id, BoardPost.user_id == auth.id))
    if not post_res.scalar_one_or_none():
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    result = await db.execute(
        select(BoardComment)
        .where(BoardComment.board_post_id == post_id, BoardComment.is_deleted.is_(False))
        .order_by(BoardComment.created_at)
    )
    items = [
        {
            "id": c.id,
            "body": c.body,
            "parent_comment_id": c.parent_comment_id,
            "is_secret": c.is_secret,
            "created_at": c.created_at.isoformat(),
            "author_admin_id": c.author_admin_id,
        }
        for c in result.scalars().all()
    ]
    return {"items": items}


@router.post("/posts/{post_id}/comments")
async def create_comment(
    post_id: int,
    body: CreateCommentBody,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post_res = await db.execute(select(BoardPost).where(BoardPost.id == post_id, BoardPost.user_id == auth.id))
    if not post_res.scalar_one_or_none():
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    comment = BoardComment(
        board_post_id=post_id,
        author_user_id=auth.id,
        body=body.body.strip(),
        parent_comment_id=body.parent_comment_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "created_at": comment.created_at.isoformat()}
