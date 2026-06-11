from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.errors import fo_api_error
from app.lib.locale import resolve_request_locale
from app.lib.formatting import faq_category_label, fmt_date, notice_category_label
from app.models.admin import AdminUser
from app.models.content import FaqItem, Notice, Term
from app.models.system import FileAttachment

router = APIRouter(tags=["content"])


def _notice_visible_now() -> datetime:
    return datetime.now(timezone.utc)


def _notice_display_window_clause(now: datetime):
    """노출 시작/종료 일시 — 미설정 시 즉시·무기한."""
    return (
        Notice.is_deleted.is_(False),
        or_(Notice.display_start_at.is_(None), Notice.display_start_at <= now),
        or_(Notice.display_end_at.is_(None), Notice.display_end_at >= now),
    )


def _notice_localized(n: Notice, lang: str) -> tuple[str, str]:
    lang = (lang or "ko").lower()
    title = n.title
    body = n.body_html or ""
    if lang == "my":
        title = n.title_my or title
        body = n.body_my or body
    elif lang == "en":
        title = n.title_en or title
        body = n.body_en or body
    return title, body


def _notice_attachments(rows: list[FileAttachment]) -> list[dict]:
    return [
        {
            "file_id": f.id,
            "filename": f.original_filename or "file",
            "size": f.size_bytes,
            "download_url": f"/api/v1/files/{f.id}",
        }
        for f in rows
    ]


@router.get("/notices")
async def list_notices(
    category: str | None = Query(None),
    q: str | None = Query(None),
    lang: str = Query("ko"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    home_preview: int | None = Query(None),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    now = _notice_visible_now()
    base = select(Notice).where(
        Notice.is_published.is_(True),
        *_notice_display_window_clause(now),
    )
    # FO 필터 칩(imp/apply 등)과 저장 카테고리 별칭 흡수.
    if category and category not in ("all", ""):
        aliases = {
            "imp": ("important", "imp"),
            "important": ("important", "imp"),
            "apply": ("apply", "registration"),
            "registration": ("apply", "registration"),
        }
        cats = aliases.get(category, (category,))
        base = base.where(Notice.category.in_(cats))
    if q:
        base = base.where(Notice.title.ilike(f"%{q}%"))

    # 총 개수(페이지네이션 메타)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    order = base.order_by(Notice.is_pinned.desc(), Notice.published_at.desc().nullslast(), Notice.id.desc())

    if home_preview:
        stmt = order.limit(5)
        page = 1
    else:
        stmt = order.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    admin_ids = {n.author_admin_id for n in rows if n.author_admin_id}
    admins: dict[int, str] = {}
    if admin_ids:
        ares = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a.name for a in ares.scalars().all()}

    items = []
    for n in rows:
        title, _ = _notice_localized(n, lang)
        items.append(
            {
                "id": n.id,
                "category": n.category,
                "category_label": notice_category_label(n.category, lang),
                "title": title,
                "is_pinned": n.is_pinned,
                "published_at": n.published_at.isoformat() if n.published_at else None,
                "date_formatted": fmt_date(n.published_at or n.created_at),
                "author_name": admins.get(n.author_admin_id, "관리자") if n.author_admin_id else "관리자",
                "view_count": n.view_count,
            }
        )
    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
        },
    }


async def _notice_neighbors(db: AsyncSession, notice: Notice, lang: str = "ko") -> tuple[dict | None, dict | None]:
    """목록과 동일한 정렬(고정↓ · 게시일↓ · id↓) 기준 이전/다음 글."""
    now = _notice_visible_now()
    pub_col = func.coalesce(Notice.published_at, Notice.created_at)
    res = await db.execute(
        select(Notice)
        .where(Notice.is_published.is_(True), *_notice_display_window_clause(now))
        .order_by(Notice.is_pinned.desc(), pub_col.desc().nullslast(), Notice.id.desc())
    )
    ordered_rows = res.scalars().all()
    ordered = [
        {"id": row.id, "title": _notice_localized(row, lang)[0]}
        for row in ordered_rows
    ]
    idx = next((i for i, row in enumerate(ordered) if row["id"] == notice.id), None)
    if idx is None:
        return None, None
    # 이전글 = 목록에서 아래(더 오래된 글), 다음글 = 위(더 최신 글)
    prev_post = ordered[idx + 1] if idx + 1 < len(ordered) else None
    next_post = ordered[idx - 1] if idx > 0 else None
    return prev_post, next_post


@router.get("/notices/{notice_id}")
async def get_notice(
    request: Request,
    notice_id: int,
    lang: str = Query("ko"),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    locale = resolve_request_locale(request, lang)
    now = _notice_visible_now()
    result = await db.execute(
        select(Notice).where(
            Notice.id == notice_id,
            Notice.is_published.is_(True),
            *_notice_display_window_clause(now),
        )
    )
    notice = result.scalar_one_or_none()
    if not notice:
        raise fo_api_error("NOT_FOUND", "notice_not_found", locale, 404)
    title, body_html = _notice_localized(notice, lang)
    notice.view_count += 1
    author_name = "관리자"
    if notice.author_admin_id:
        ares = await db.execute(select(AdminUser).where(AdminUser.id == notice.author_admin_id))
        admin = ares.scalar_one_or_none()
        if admin:
            author_name = admin.name
    att_res = await db.execute(
        select(FileAttachment).where(
            FileAttachment.owner_type == "notice", FileAttachment.owner_id == notice.id
        )
    )
    prev_post, next_post = await _notice_neighbors(db, notice, lang)
    await db.commit()
    return {
        "id": notice.id,
        "category": notice.category,
        "category_label": notice_category_label(notice.category, lang),
        "title": title,
        "body_html": body_html,
        "is_pinned": notice.is_pinned,
        "published_at": notice.published_at.isoformat() if notice.published_at else None,
        "date_formatted": fmt_date(notice.published_at or notice.created_at),
        "author_name": author_name,
        "view_count": notice.view_count,
        "attachments": _notice_attachments(att_res.scalars().all()),
        "prev": prev_post,
        "next": next_post,
    }


@router.get("/faq")
async def list_faq(
    lang: str = Query("ko"),
    q: str | None = Query(None),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(FaqItem).where(FaqItem.is_active.is_(True)).order_by(FaqItem.sort_order, FaqItem.id)
    )
    items: list[dict] = []
    groups_map: dict[str, dict] = {}
    groups: list[dict] = []
    for row in result.scalars().all():
        question = getattr(row, f"question_{lang}", None) or row.question_ko
        answer = getattr(row, f"answer_{lang}", None) or row.answer_ko
        if q and q.lower() not in (question or "").lower() and q.lower() not in (answer or "").lower():
            continue
        item = {
            "id": row.id,
            "category": row.category,
            "category_label": faq_category_label(row.category, lang),
            "question": question,
            "answer": answer,
            "sort_order": row.sort_order,
        }
        items.append(item)
        grp = groups_map.get(row.category)
        if grp is None:
            grp = {
                "category": row.category,
                "category_label": faq_category_label(row.category, lang),
                "items": [],
            }
            groups_map[row.category] = grp
            groups.append(grp)
        grp["items"].append(item)
    return {"items": items, "groups": groups}


@router.get("/terms")
async def list_terms(db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(Term).where(Term.status == "published").order_by(Term.term_type, Term.published_at.desc()))
    seen: set[str] = set()
    items = []
    for row in result.scalars().all():
        if row.term_type in seen:
            continue
        seen.add(row.term_type)
        items.append(
            {
                "id": row.id,
                "term_type": row.term_type,
                "version": row.version,
                "title": row.title,
                "effective_at": row.effective_at.isoformat() if row.effective_at else None,
                "published_at": row.published_at.isoformat() if row.published_at else None,
            }
        )
    return {"items": items}


@router.get("/terms/{term_type}")
async def get_term(
    request: Request,
    term_type: str,
    lang: str = Query("ko"),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    locale = resolve_request_locale(request, lang)
    result = await db.execute(
        select(Term)
        .where(Term.term_type == term_type, Term.status == "published")
        .order_by(Term.published_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise fo_api_error("NOT_FOUND", "terms_not_found", locale, 404)
    body = getattr(row, f"body_{lang}", None) or row.body_ko
    return {
        "id": row.id,
        "term_type": row.term_type,
        "version": row.version,
        "title": row.title,
        "body": body,
        "effective_at": row.effective_at.isoformat() if row.effective_at else None,
    }
