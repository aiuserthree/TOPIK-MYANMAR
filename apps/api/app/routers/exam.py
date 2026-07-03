from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.lib.exam_round_status import sync_exam_rounds_status
from app.models.exam import ExamRound, ExamVenue

router = APIRouter(tags=["exam"])

_MMT = ZoneInfo("Asia/Yangon")


def _payment_window(r: ExamRound) -> tuple[str | None, str | None]:
    """응시료 수납 기간 — BO 설정값 우선, 없으면 접수 마감(MMT) +3~+5일."""
    if r.payment_start_at and r.payment_end_at:
        return r.payment_start_at.isoformat(), r.payment_end_at.isoformat()
    if not r.registration_end_at:
        return None, None
    reg_date = r.registration_end_at.astimezone(_MMT).date()
    start = datetime.combine(reg_date + timedelta(days=3), time.min, tzinfo=_MMT)
    end = datetime.combine(reg_date + timedelta(days=5), time(23, 59, 59), tzinfo=_MMT)
    return start.isoformat(), end.isoformat()


def serialize_round(r: ExamRound) -> dict:
    payment_start, payment_end = _payment_window(r)
    result_date = r.result_date.isoformat() if r.result_date else None
    return {
        "id": r.id,
        "round_no": r.round_no,
        "title": r.title,
        "exam_date": r.exam_date.isoformat(),
        "result_date": result_date,
        "result_announcement_date": result_date,
        "registration_start_at": r.registration_start_at.isoformat(),
        "registration_end_at": r.registration_end_at.isoformat(),
        "payment_start_at": payment_start,
        "payment_end_at": payment_end,
        "fee_level_i": r.fee_level_i,
        "fee_level_ii": r.fee_level_ii,
        "fees": {"I": r.fee_level_i, "II": r.fee_level_ii},
        "capacity": r.capacity,
        "registration_status": r.registration_status,
        "exam_number_visible_at": r.exam_number_visible_at.isoformat() if r.exam_number_visible_at else None,
        "venue_ids": [link.exam_venue_id for link in r.venue_links],
    }


def serialize_venue(v: ExamVenue) -> dict:
    return {
        "id": v.id,
        "venue_code": v.venue_code,
        "name_ko": v.name_ko,
        "name_en": v.name_en,
        "name_my": v.name_my,
        "address": v.address,
        "country_code": v.country_code,
        "region_code": v.region_code,
        "capacity": v.capacity,
        "is_active": v.is_active,
        "memo": v.memo,
    }


@router.get("/exam-rounds")
async def list_exam_rounds(
    registration_status: str | None = Query(None),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    stmt = (
        select(ExamRound)
        .options(selectinload(ExamRound.venue_links))
        .where(ExamRound.registration_status != "revoked")
        .order_by(ExamRound.round_no.desc())
    )
    if registration_status:
        stmt = stmt.where(ExamRound.registration_status == registration_status)
    result = await db.execute(stmt)
    rounds = list(result.scalars().all())
    await sync_exam_rounds_status(db, rounds)
    if registration_status:
        rounds = [r for r in rounds if r.registration_status == registration_status]
    return {"items": [serialize_round(r) for r in rounds]}


@router.get("/exam-venues")
async def list_exam_venues(db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(
        select(ExamVenue).where(ExamVenue.is_active.is_(True)).order_by(ExamVenue.venue_code)
    )
    venues = result.scalars().all()
    return {"items": [serialize_venue(v) for v in venues]}
