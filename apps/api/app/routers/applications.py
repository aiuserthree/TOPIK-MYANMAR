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
from app.models.application import Application, ApplicationDraft, ApplicationSubmission
from app.models.exam import ExamRound, ExamVenue
from app.models.user import User

router = APIRouter(tags=["applications"])


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


@router.get("/applications")
async def my_applications(auth: AuthUser = Depends(require_user), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(
        select(ApplicationSubmission)
        .where(ApplicationSubmission.user_id == auth.id)
        .options(selectinload(ApplicationSubmission.applications))
        .order_by(ApplicationSubmission.submitted_at.desc())
    )
    submissions = result.scalars().all()
    items = []
    for sub in submissions:
        items.append(
            {
                "submission_id": sub.id,
                "exam_round_id": sub.exam_round_id,
                "exam_venue_id": sub.exam_venue_id,
                "status": sub.status,
                "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
                "cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
                "applications": [
                    {
                        "id": a.id,
                        "exam_level": a.exam_level,
                        "status": a.status,
                        "payment_status": a.payment_status,
                        "photo_review_status": a.photo_review_status,
                        "exam_number": a.exam_number if a.exam_number_visible else None,
                        "application_no": a.application_no,
                    }
                    for a in sub.applications
                ],
            }
        )
    return {"items": items}


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
