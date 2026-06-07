from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models.exam import ExamRound, ExamVenue

router = APIRouter(tags=["exam"])


def serialize_round(r: ExamRound) -> dict:
    return {
        "id": r.id,
        "round_no": r.round_no,
        "title": r.title,
        "exam_date": r.exam_date.isoformat(),
        "result_date": r.result_date.isoformat() if r.result_date else None,
        "registration_start_at": r.registration_start_at.isoformat(),
        "registration_end_at": r.registration_end_at.isoformat(),
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
    stmt = select(ExamRound).options(selectinload(ExamRound.venue_links)).order_by(ExamRound.round_no.desc())
    if registration_status:
        stmt = stmt.where(ExamRound.registration_status == registration_status)
    result = await db.execute(stmt)
    rounds = result.scalars().all()
    return {"items": [serialize_round(r) for r in rounds]}


@router.get("/exam-venues")
async def list_exam_venues(db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(
        select(ExamVenue).where(ExamVenue.is_active.is_(True)).order_by(ExamVenue.venue_code)
    )
    venues = result.scalars().all()
    return {"items": [serialize_venue(v) for v in venues]}
