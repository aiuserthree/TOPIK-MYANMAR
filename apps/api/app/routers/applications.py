from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.lib.deps import AuthUser, require_user
from app.lib.errors import api_error
from app.lib.formatting import (
    card_status_label,
    derive_card_status,
    exam_number_visible as _exam_number_visible,
    fmt_date,
    fmt_date_only,
)
from app.models.application import Application, ApplicationDraft, ApplicationSubmission
from app.models.exam import ExamRound, ExamVenue
from app.models.user import User

router = APIRouter(tags=["applications"])

_LEVEL_TEXT = {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"}


class DraftBody(BaseModel):
    payload: dict = Field(default_factory=dict)


class SubmitBody(BaseModel):
    exam_round_id: int
    exam_venue_id: int
    exam_levels: list[str]
    photo_checklist_confirmed: bool = False
    accommodation_requested: bool = False


async def _purge_expired_drafts(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        delete(ApplicationDraft).where(
            ApplicationDraft.user_id == user_id,
            ApplicationDraft.expires_at <= datetime.now(timezone.utc),
        )
    )


@router.get("/application-draft")
async def get_draft(auth: AuthUser = Depends(require_user), db: AsyncSession = Depends(get_db_session)) -> dict:
    await _purge_expired_drafts(db, auth.id)
    result = await db.execute(
        select(ApplicationDraft).where(
            ApplicationDraft.user_id == auth.id,
            ApplicationDraft.expires_at > datetime.now(timezone.utc),
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "임시 저장된 접수 정보가 없습니다.", 404)
    return {"payload": row.payload, "updated_at": row.updated_at, "expires_at": row.expires_at}


@router.put("/application-draft")
async def save_draft(
    body: DraftBody,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    await _purge_expired_drafts(db, auth.id)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    result = await db.execute(select(ApplicationDraft).where(ApplicationDraft.user_id == auth.id))
    row = result.scalar_one_or_none()
    if row:
        row.payload = body.payload
        row.updated_at = datetime.now(timezone.utc)
        row.expires_at = expires
    else:
        row = ApplicationDraft(user_id=auth.id, payload=body.payload, expires_at=expires)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"saved": True, "payload": row.payload, "updated_at": row.updated_at, "expires_at": row.expires_at}


@router.delete("/application-draft")
async def delete_draft(auth: AuthUser = Depends(require_user), db: AsyncSession = Depends(get_db_session)) -> dict:
    await db.execute(delete(ApplicationDraft).where(ApplicationDraft.user_id == auth.id))
    await db.commit()
    return {"deleted": True}


@router.post("/application-submissions")
async def submit_application(
    body: SubmitBody,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    levels = [lv.upper() for lv in body.exam_levels if lv.upper() in ("I", "II")]
    if not levels:
        raise api_error("VALIDATION_ERROR", "응시 급수를 선택해 주세요.")
    if not body.photo_checklist_confirmed:
        raise api_error("VALIDATION_ERROR", "사진 확인 체크리스트에 동의해 주세요.")

    round_res = await db.execute(select(ExamRound).where(ExamRound.id == body.exam_round_id))
    exam_round = round_res.scalar_one_or_none()
    if not exam_round or exam_round.registration_status != "open":
        raise api_error("ROUND_NOT_OPEN", "접수 가능한 회차가 아닙니다.", 400)

    venue_res = await db.execute(select(ExamVenue).where(ExamVenue.id == body.exam_venue_id, ExamVenue.is_active))
    venue = venue_res.scalar_one_or_none()
    if not venue:
        raise api_error("INVALID_VENUE", "유효하지 않은 시험장입니다.", 400)

    dup = await db.execute(
        select(ApplicationSubmission.id).where(
            ApplicationSubmission.user_id == auth.id,
            ApplicationSubmission.exam_round_id == body.exam_round_id,
            ApplicationSubmission.cancelled_at.is_(None),
        )
    )
    if dup.scalar_one_or_none():
        raise api_error("ALREADY_SUBMITTED", "이미 해당 회차에 접수한 내역이 있습니다.", 409)

    user_res = await db.execute(select(User).where(User.id == auth.id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "사용자를 찾을 수 없습니다.", 404)

    submission = ApplicationSubmission(
        user_id=auth.id,
        exam_round_id=body.exam_round_id,
        exam_venue_id=body.exam_venue_id,
        photo_checklist_confirmed=body.photo_checklist_confirmed,
        accommodation_requested=body.accommodation_requested,
        status="submitted",
    )
    db.add(submission)
    await db.flush()

    apps: list[Application] = []
    for level in levels:
        app_row = Application(
            submission_id=submission.id,
            user_id=auth.id,
            exam_round_id=body.exam_round_id,
            exam_venue_id=body.exam_venue_id,
            exam_level=level,
            application_no=f"APP-{submission.id}-{level}",
            photo_file_id=user.photo_file_id,
            status="submitted",
        )
        db.add(app_row)
        apps.append(app_row)
    await db.execute(delete(ApplicationDraft).where(ApplicationDraft.user_id == auth.id))
    await db.commit()
    return {
        "submission_id": submission.id,
        "applications": [{"id": a.id, "exam_level": a.exam_level, "status": a.status} for a in apps],
    }


def _serialize_submission(
    sub: ApplicationSubmission,
    rounds: dict[int, ExamRound],
    venues: dict[int, ExamVenue],
) -> dict:
    """FO 마이페이지(mypage.html)·수험표(ticket.html)가 기대하는 풍부한 item 모양."""
    rnd = rounds.get(sub.exam_round_id)
    venue = venues.get(sub.exam_venue_id)
    round_visible_at = rnd.exam_number_visible_at if rnd else None

    # 급수 정렬: TOPIK Ⅰ → Ⅱ
    apps_sorted = sorted(sub.applications, key=lambda a: 0 if a.exam_level == "I" else 1)

    levels = []
    for a in apps_sorted:
        visible = _exam_number_visible(a.exam_number, round_visible_at)
        levels.append(
            {
                "id": a.id,
                "exam_level": a.exam_level,
                "level_text": _LEVEL_TEXT.get(a.exam_level, a.exam_level),
                "application_no": a.application_no,
                "status": a.status,
                "display_status": a.status,
                "photo_review_status": a.photo_review_status,
                "photo_reject_code": a.photo_reject_code,
                "photo_reject_note": a.photo_reject_note,
                "payment_status": a.payment_status,
                "exam_number": a.exam_number if visible else None,
                "exam_number_visible": visible,
            }
        )

    card_status = derive_card_status(sub.applications)
    levels_text = " · ".join(
        _LEVEL_TEXT.get(a.exam_level, a.exam_level) for a in apps_sorted
    )
    is_past = bool(sub.cancelled_at) or sub.status == "cancelled" or card_status == "cancelled"

    return {
        "submission_id": sub.id,
        "exam_round_id": sub.exam_round_id,
        "exam_venue_id": sub.exam_venue_id,
        "status": sub.status,
        "tab": "past" if is_past else "active",
        "fo_card_status": card_status,
        "card_status_label": card_status_label(card_status),
        "levels": levels,
        "levels_text": levels_text,
        "accommodation_requested": sub.accommodation_requested,
        "exam_round": {
            "id": rnd.id if rnd else None,
            "round_no": rnd.round_no if rnd else None,
            "title": rnd.title if rnd else None,
            "exam_date": rnd.exam_date.isoformat() if rnd and rnd.exam_date else None,
        }
        if rnd
        else None,
        "venue": {
            "id": venue.id if venue else None,
            "name_ko": venue.name_ko if venue else None,
            "name_en": venue.name_en if venue else None,
        }
        if venue
        else None,
        "exam_date_formatted": fmt_date_only(rnd.exam_date) if rnd else "",
        "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        "submitted_at_formatted": fmt_date(sub.submitted_at),
        "cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        # 하위호환: 기존 키
        "applications": [
            {
                "id": a.id,
                "exam_level": a.exam_level,
                "status": a.status,
                "payment_status": a.payment_status,
                "photo_review_status": a.photo_review_status,
                "exam_number": a.exam_number if _exam_number_visible(a.exam_number, round_visible_at) else None,
                "application_no": a.application_no,
            }
            for a in apps_sorted
        ],
    }


@router.get("/applications")
async def my_applications(auth: AuthUser = Depends(require_user), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(
        select(ApplicationSubmission)
        .where(ApplicationSubmission.user_id == auth.id)
        .options(selectinload(ApplicationSubmission.applications))
        .order_by(ApplicationSubmission.submitted_at.desc())
    )
    submissions = result.scalars().all()

    round_ids = {s.exam_round_id for s in submissions}
    venue_ids = {s.exam_venue_id for s in submissions}
    rounds: dict[int, ExamRound] = {}
    venues: dict[int, ExamVenue] = {}
    if round_ids:
        rres = await db.execute(select(ExamRound).where(ExamRound.id.in_(round_ids)))
        rounds = {r.id: r for r in rres.scalars().all()}
    if venue_ids:
        vres = await db.execute(select(ExamVenue).where(ExamVenue.id.in_(venue_ids)))
        venues = {v.id: v for v in vres.scalars().all()}

    items = [_serialize_submission(s, rounds, venues) for s in submissions]
    active = [i for i in items if i["tab"] == "active"]
    past = [i for i in items if i["tab"] == "past"]
    return {"items": items, "active": active, "past": past}


@router.post("/application-submissions/{submission_id}/cancel")
async def cancel_submission(
    submission_id: int,
    body: dict | None = None,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(ApplicationSubmission)
        .where(ApplicationSubmission.id == submission_id, ApplicationSubmission.user_id == auth.id)
        .options(selectinload(ApplicationSubmission.applications))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise api_error("NOT_FOUND", "접수 내역을 찾을 수 없습니다.", 404)
    if sub.cancelled_at:
        raise api_error("ALREADY_CANCELLED", "이미 취소된 접수입니다.", 409)
    for app in sub.applications:
        if app.payment_status == "paid":
            raise api_error("CANNOT_CANCEL", "수납 완료된 접수는 취소할 수 없습니다.", 400)
    reason = (body or {}).get("reason", "사용자 취소")
    now = datetime.now(timezone.utc)
    sub.cancelled_at = now
    sub.cancel_reason = reason
    sub.status = "cancelled"
    for app in sub.applications:
        app.cancelled_at = now
        app.cancel_reason = reason
        app.status = "cancelled"
    await db.commit()
    return {"cancelled": True}
