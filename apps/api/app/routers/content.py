from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.errors import api_error
from app.models.content import FaqItem, Notice, Term

router = APIRouter(tags=["content"])


@router.get("/notices")
async def list_notices(
    category: str | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    home_preview: int | None = Query(None),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    stmt = select(Notice).where(Notice.is_published.is_(True)).order_by(Notice.is_pinned.desc(), Notice.published_at.desc())
    if category:
        stmt = stmt.where(Notice.category == category)
    if q:
        stmt = stmt.where(Notice.title.ilike(f"%{q}%"))
    if home_preview:
        stmt = stmt.limit(5)
    else:
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = [
        {
            "id": n.id,
            "category": n.category,
            "title": n.title,
            "is_pinned": n.is_pinned,
            "published_at": n.published_at.isoformat() if n.published_at else None,
            "view_count": n.view_count,
        }
        for n in result.scalars().all()
    ]
    return {"items": items, "page": page, "page_size": page_size}


@router.get("/notices/{notice_id}")
async def get_notice(notice_id: int, db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(Notice).where(Notice.id == notice_id, Notice.is_published.is_(True)))
    notice = result.scalar_one_or_none()
    if not notice:
        raise api_error("NOT_FOUND", "공지를 찾을 수 없습니다.", 404)
    notice.view_count += 1
    await db.commit()
    return {
        "id": notice.id,
        "category": notice.category,
        "title": notice.title,
        "body_html": notice.body_html,
        "is_pinned": notice.is_pinned,
        "published_at": notice.published_at.isoformat() if notice.published_at else None,
        "view_count": notice.view_count,
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
    items = []
    for row in result.scalars().all():
        question = getattr(row, f"question_{lang}", None) or row.question_ko
        answer = getattr(row, f"answer_{lang}", None) or row.answer_ko
        if q and q.lower() not in (question or "").lower() and q.lower() not in (answer or "").lower():
            continue
        items.append(
            {
                "id": row.id,
                "category": row.category,
                "question": question,
                "answer": answer,
                "sort_order": row.sort_order,
            }
        )
    return {"items": items}


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
async def get_term(term_type: str, lang: str = Query("ko"), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(
        select(Term)
        .where(Term.term_type == term_type, Term.status == "published")
        .order_by(Term.published_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    body = getattr(row, f"body_{lang}", None) or row.body_ko
    return {
        "id": row.id,
        "term_type": row.term_type,
        "version": row.version,
        "title": row.title,
        "body": body,
        "effective_at": row.effective_at.isoformat() if row.effective_at else None,
    }
