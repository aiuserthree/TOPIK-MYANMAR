from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.formatting import fmt_datetime
from app.models.admin import AdminUser
from app.models.board import BoardComment, BoardPost


async def official_replies_for_post(
    db: AsyncSession,
    post: BoardPost,
) -> list[dict]:
    """게시글의 공식 답변 이력 (최신순)."""
    result = await db.execute(
        select(BoardComment)
        .where(
            BoardComment.board_post_id == post.id,
            BoardComment.is_official_reply.is_(True),
            BoardComment.is_deleted.is_(False),
        )
        .order_by(BoardComment.created_at, BoardComment.id)
    )
    comments = result.scalars().all()
    if not comments and post.admin_reply:
        admin_name = None
        if post.admin_replier_id:
            ares = await db.execute(
                select(AdminUser).where(AdminUser.id == post.admin_replier_id)
            )
            admin = ares.scalar_one_or_none()
            admin_name = admin.name if admin else None
        return [{
            "id": None,
            "body": post.admin_reply,
            "author": admin_name or "관리자",
            "author_admin_id": post.admin_replier_id,
            "created_at": post.admin_replied_at.isoformat() if post.admin_replied_at else None,
            "created_at_label": fmt_datetime(post.admin_replied_at),
        }]
    admin_ids = {c.author_admin_id for c in comments if c.author_admin_id}
    admins: dict[int, str] = {}
    if admin_ids:
        ares = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a.name for a in ares.scalars().all()}
    return [
        {
            "id": c.id,
            "body": c.body,
            "author": admins.get(c.author_admin_id) or "관리자" if c.author_admin_id else "관리자",
            "author_admin_id": c.author_admin_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "created_at_label": fmt_datetime(c.created_at),
        }
        for c in comments
    ]


def build_comment_tree(
    comments: list[BoardComment],
    *,
    author_for,
) -> list[dict]:
    """댓글/대댓글 트리 (공식 답변 제외)."""
    nodes: dict[int, dict] = {}
    roots: list[dict] = []
    for c in comments:
        if c.is_official_reply:
            continue
        nodes[c.id] = {
            "id": c.id,
            "parent_comment_id": c.parent_comment_id,
            "body": c.body,
            "is_secret": c.is_secret,
            "is_admin": c.author_admin_id is not None,
            "author": author_for(c),
            "author_user_id": c.author_user_id,
            "author_admin_id": c.author_admin_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "created_at_label": fmt_datetime(c.created_at),
            "replies": [],
        }
    for c in comments:
        if c.is_official_reply:
            continue
        node = nodes[c.id]
        if c.parent_comment_id and c.parent_comment_id in nodes:
            nodes[c.parent_comment_id]["replies"].append(node)
        else:
            roots.append(node)
    return roots


def resolve_comment_is_secret(post: BoardPost, is_public: bool | None) -> bool:
    """비밀글 게시물은 댓글 자동 비밀. 일반글은 BO is_public 체크박스 반영."""
    if post.is_secret:
        return True
    if is_public is None:
        return False
    return not is_public


def can_view_board_comment(comment: BoardComment, post: BoardPost, viewer_user_id: int) -> bool:
    """FO — 비공개 댓글은 게시글 작성자·댓글 작성자만 열람."""
    if not comment.is_secret:
        return True
    if post.user_id == viewer_user_id:
        return True
    if comment.author_user_id == viewer_user_id:
        return True
    return False


def filter_visible_comments(
    comments: list[BoardComment],
    post: BoardPost,
    viewer_user_id: int,
) -> list[BoardComment]:
    """비공개 댓글·상위가 숨겨진 대댓글 제외."""
    by_id = {c.id: c for c in comments}
    visible_ids: set[int] = set()
    for c in comments:
        if c.is_official_reply:
            continue
        if not can_view_board_comment(c, post, viewer_user_id):
            continue
        ok = True
        pid = c.parent_comment_id
        while pid:
            parent = by_id.get(pid)
            if not parent or not can_view_board_comment(parent, post, viewer_user_id):
                ok = False
                break
            pid = parent.parent_comment_id
        if ok:
            visible_ids.add(c.id)
    return [c for c in comments if c.id in visible_ids]


def parse_parent_comment_id(raw) -> int | None:
    """JSON body에서 parent_comment_id를 정수로 변환 (asyncpg는 str FK 불가)."""
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
