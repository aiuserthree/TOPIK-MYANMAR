from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.lib.consents import persist_term_consents, required_terms_consent_error
from app.lib.deps import AuthUser, get_client_ip, require_complete_user
from app.lib.errors import api_error, fo_api_error
from app.lib.fo_messages import level_label
from app.lib.exam_round_status import sync_exam_round_status
from app.lib.locale import resolve_request_locale
from app.lib.formatting import (
    card_status_label,
    derive_card_status_for_app,
    derive_rejection_info_for_app,
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
    reapply: bool = False
    # 접수 시 약관 동의 이력 — [{"type":"service","version":"1.0","agreed":true}, ...]
    terms_agreed: list[dict] = Field(default_factory=list)


def _is_app_cancelled(app: Application) -> bool:
    return app.status == "cancelled" or bool(app.cancelled_at)


def _is_app_rejected(sub: ApplicationSubmission) -> bool:
    """접수 반려(app_rejected) — 사진 반려(photo_rejected)는 제외."""
    active = [a for a in sub.applications if not _is_app_cancelled(a)]
    return any(a.status == "rejected" for a in active)


def _apps_by_level(sub: ApplicationSubmission) -> dict[str, Application]:
    """급수별 대표 application — 취소된 행보다 진행 중 행을 우선."""
    by_level: dict[str, Application] = {}
    for app in sub.applications:
        lv = app.exam_level
        prev = by_level.get(lv)
        if prev is None or (_is_app_cancelled(prev) and not _is_app_cancelled(app)):
            by_level[lv] = app
    return by_level


def _has_in_progress_level(sub: ApplicationSubmission) -> bool:
    """동일 회차에 반려·취소가 아닌 진행 중 급수가 있는지."""
    for app in _apps_by_level(sub).values():
        if _is_app_cancelled(app):
            continue
        if app.status != "rejected":
            return True
    return False


def _reactivate_application(
    app: Application,
    *,
    venue_id: int,
    photo_file_id: int | None,
) -> None:
    """취소된 급수 행을 동일 submission에서 다시 접수(submitted) 상태로 복구."""
    app.exam_venue_id = venue_id
    app.photo_file_id = photo_file_id
    app.status = "submitted"
    app.photo_review_status = "pending"
    app.photo_reject_code = None
    app.photo_reject_note = None
    app.reject_reason = None
    app.cancelled_at = None
    app.cancel_reason = None
    app.payment_status = "unpaid"
    app.payment_receipt_no = None
    app.paid_at = None
    app.payment_memo = None
    app.payment_cancel_reason = None


async def _purge_expired_drafts(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        delete(ApplicationDraft).where(
            ApplicationDraft.user_id == user_id,
            ApplicationDraft.expires_at <= datetime.now(timezone.utc),
        )
    )


@router.get("/application-draft")
async def get_draft(
    request: Request,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    lang = resolve_request_locale(request)
    await _purge_expired_drafts(db, auth.id)
    result = await db.execute(
        select(ApplicationDraft).where(
            ApplicationDraft.user_id == auth.id,
            ApplicationDraft.expires_at > datetime.now(timezone.utc),
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise fo_api_error("NOT_FOUND", "draft_not_found", lang, 404)
    return {"payload": row.payload, "updated_at": row.updated_at, "expires_at": row.expires_at}


@router.put("/application-draft")
async def save_draft(
    body: DraftBody,
    auth: AuthUser = Depends(require_complete_user),
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
async def delete_draft(auth: AuthUser = Depends(require_complete_user), db: AsyncSession = Depends(get_db_session)) -> dict:
    await db.execute(delete(ApplicationDraft).where(ApplicationDraft.user_id == auth.id))
    await db.commit()
    return {"deleted": True}


@router.post("/application-submissions")
async def submit_application(
    request: Request,
    body: SubmitBody,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
    ip: str | None = Depends(get_client_ip),
) -> dict:
    lang = resolve_request_locale(request)
    levels = [lv.upper() for lv in body.exam_levels if lv.upper() in ("I", "II")]
    if not levels:
        raise fo_api_error("VALIDATION_ERROR", "select_level", lang)
    if not body.photo_checklist_confirmed:
        raise fo_api_error("VALIDATION_ERROR", "photo_checklist", lang)
    terms_err = required_terms_consent_error(body.terms_agreed, lang=lang)
    if terms_err:
        raise api_error("VALIDATION_ERROR", terms_err)

    user_res = await db.execute(select(User).where(User.id == auth.id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise fo_api_error("NOT_FOUND", "user_not_found", lang, 404)
    await persist_term_consents(
        db,
        user_id=auth.id,
        terms_agreed=body.terms_agreed,
        marketing_opt_in=user.marketing_opt_in,
        ip=ip,
    )

    round_res = await db.execute(select(ExamRound).where(ExamRound.id == body.exam_round_id))
    exam_round = round_res.scalar_one_or_none()
    if exam_round:
        await sync_exam_round_status(db, exam_round)
    if not exam_round or exam_round.registration_status != "open":
        raise fo_api_error("ROUND_NOT_OPEN", "round_not_open", lang, 400)

    existing_res = await db.execute(
        select(ApplicationSubmission)
        .where(
            ApplicationSubmission.user_id == auth.id,
            ApplicationSubmission.exam_round_id == body.exam_round_id,
        )
        .options(selectinload(ApplicationSubmission.applications))
    )
    existing = existing_res.scalar_one_or_none()

    is_reapply = bool(existing and existing.cancelled_at is None and body.reapply)
    venue_locked = bool(
        existing and existing.cancelled_at is None and _has_in_progress_level(existing)
    )
    if venue_locked:
        if body.exam_venue_id != existing.exam_venue_id:
            raise fo_api_error("VALIDATION_ERROR", "venue_locked", lang, 400)
        venue_res = await db.execute(select(ExamVenue).where(ExamVenue.id == existing.exam_venue_id))
    else:
        venue_res = await db.execute(
            select(ExamVenue).where(ExamVenue.id == body.exam_venue_id, ExamVenue.is_active)
        )
    venue = venue_res.scalar_one_or_none()
    if not venue:
        raise fo_api_error("INVALID_VENUE", "invalid_venue", lang, 400)

    now = datetime.now(timezone.utc)
    if is_reapply:
        if not _is_app_rejected(existing):
            raise fo_api_error("VALIDATION_ERROR", "reapply_not_found", lang)
        # Partial reapply — reset rejected rows and re-activate cancelled rows; keep in-progress intact.
        existing_apps = {a.exam_level: a for a in existing.applications}
        for level in levels:
            app = existing_apps.get(level)
            if not app:
                raise fo_api_error(
                    "VALIDATION_ERROR",
                    "level_record_missing",
                    lang,
                    level=level_label(level, lang),
                )
            if _is_app_cancelled(app) or app.status == "rejected":
                continue
            raise fo_api_error(
                "VALIDATION_ERROR",
                "level_reapply_locked",
                lang,
                level=level_label(level, lang),
            )

        existing.photo_checklist_confirmed = body.photo_checklist_confirmed
        existing.accommodation_requested = body.accommodation_requested
        existing.status = "submitted"
        existing.submitted_at = now
        if not venue_locked:
            existing.exam_venue_id = body.exam_venue_id

        venue_id = existing.exam_venue_id if venue_locked else body.exam_venue_id
        apps: list[Application] = []
        for level in levels:
            app = existing_apps[level]
            _reactivate_application(app, venue_id=venue_id, photo_file_id=user.photo_file_id)
            apps.append(app)

        await db.execute(delete(ApplicationDraft).where(ApplicationDraft.user_id == auth.id))
        await db.commit()
        return {
            "submission_id": existing.id,
            "applications": [{"id": a.id, "exam_level": a.exam_level, "status": a.status} for a in apps],
        }

    if existing and existing.cancelled_at is None and not body.reapply:
        # Same round — add new levels or re-activate cancelled level rows (e.g. I cancelled + II 진행 중 → I 재신청).
        by_level = _apps_by_level(existing)
        levels_to_add: list[str] = []
        in_progress_requested: list[str] = []
        rejected_requested: list[str] = []

        for level in levels:
            app = by_level.get(level)
            if app is None or _is_app_cancelled(app):
                levels_to_add.append(level)
            elif app.status == "rejected":
                rejected_requested.append(level)
            else:
                in_progress_requested.append(level)

        if rejected_requested:
            names = ", ".join(level_label(lv, lang) for lv in rejected_requested)
            raise fo_api_error("VALIDATION_ERROR", "level_reapply_needed", lang, levels=names)

        if not levels_to_add:
            if in_progress_requested:
                names = ", ".join(level_label(lv, lang) for lv in in_progress_requested)
                raise fo_api_error("ALREADY_SUBMITTED", "level_in_progress", lang, 409, levels=names)
            raise fo_api_error("ALREADY_SUBMITTED", "already_submitted_round", lang, 409)

        venue_id = existing.exam_venue_id if venue_locked else body.exam_venue_id
        if venue_locked:
            existing.exam_venue_id = venue_id
        existing.photo_checklist_confirmed = body.photo_checklist_confirmed
        existing.accommodation_requested = body.accommodation_requested

        added_apps: list[Application] = []
        for level in levels_to_add:
            app = by_level.get(level)
            if app and _is_app_cancelled(app):
                _reactivate_application(app, venue_id=venue_id, photo_file_id=user.photo_file_id)
                added_apps.append(app)
            else:
                app_row = Application(
                    submission_id=existing.id,
                    user_id=auth.id,
                    exam_round_id=body.exam_round_id,
                    exam_venue_id=venue_id,
                    exam_level=level,
                    application_no=f"APP-{existing.id}-{level}",
                    photo_file_id=user.photo_file_id,
                    status="submitted",
                )
                db.add(app_row)
                added_apps.append(app_row)

        await db.execute(delete(ApplicationDraft).where(ApplicationDraft.user_id == auth.id))
        await db.commit()
        return {
            "submission_id": existing.id,
            "applications": [{"id": a.id, "exam_level": a.exam_level, "status": a.status} for a in added_apps],
        }

    if existing:
        # UNIQUE(user_id, exam_round_id) keeps cancelled rows — re-activate instead of INSERT.
        existing.exam_venue_id = body.exam_venue_id
        existing.photo_checklist_confirmed = body.photo_checklist_confirmed
        existing.accommodation_requested = body.accommodation_requested
        existing.status = "submitted"
        existing.cancelled_at = None
        existing.cancel_reason = None
        existing.submitted_at = now
        submission = existing
        await db.execute(delete(Application).where(Application.submission_id == existing.id))
        await db.flush()
    else:
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

    apps = []
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


def _level_payload(app: Application, round_visible_at) -> dict:
    visible = _exam_number_visible(app.exam_number, round_visible_at)
    return {
        "id": app.id,
        "exam_level": app.exam_level,
        "level_text": _LEVEL_TEXT.get(app.exam_level, app.exam_level),
        "application_no": app.application_no,
        "status": app.status,
        "display_status": app.status,
        "photo_review_status": app.photo_review_status,
        "photo_reject_code": app.photo_reject_code,
        "photo_reject_note": app.photo_reject_note,
        "reject_reason": app.reject_reason,
        "cancelled_at": app.cancelled_at.isoformat() if app.cancelled_at else None,
        "payment_status": app.payment_status,
        "exam_number": app.exam_number if visible else None,
        "exam_number_visible": visible,
    }


def _serialize_level_item(
    sub: ApplicationSubmission,
    app: Application,
    rounds: dict[int, ExamRound],
    venues: dict[int, ExamVenue],
    lang: str = "ko",
) -> dict:
    """FO 마이페이지·수험표용 — 급수(application) 1건당 카드 1개."""
    rnd = rounds.get(sub.exam_round_id)
    venue = venues.get(sub.exam_venue_id)
    round_visible_at = rnd.exam_number_visible_at if rnd else None
    level = _level_payload(app, round_visible_at)
    submission_cancelled = bool(sub.cancelled_at) or sub.status == "cancelled"
    card_status = derive_card_status_for_app(app, submission_cancelled)
    rejection = derive_rejection_info_for_app(app)
    level_text = _LEVEL_TEXT.get(app.exam_level, app.exam_level)
    is_past = submission_cancelled or _is_app_cancelled(app)
    fee: int | None = None
    if rnd:
        fee = rnd.fee_level_i if app.exam_level == "I" else rnd.fee_level_ii

    return {
        "application_id": app.id,
        "submission_id": sub.id,
        "exam_round_id": sub.exam_round_id,
        "exam_venue_id": sub.exam_venue_id,
        "exam_level": app.exam_level,
        "level_text": level_text,
        "application_no": app.application_no,
        "status": app.status,
        "payment_status": app.payment_status,
        "photo_review_status": app.photo_review_status,
        "photo_reject_code": app.photo_reject_code,
        "photo_reject_note": app.photo_reject_note,
        "reject_reason": app.reject_reason,
        "exam_number": level["exam_number"],
        "exam_number_visible": level["exam_number_visible"],
        "tab": "past" if is_past else "active",
        "fo_card_status": card_status,
        "card_status_label": card_status_label(card_status, lang),
        "rejection_type": rejection["type"] if rejection else None,
        "rejection_reason": rejection["reason"] if rejection else None,
        "levels": [level],
        "levels_text": level_text,
        "accommodation_requested": sub.accommodation_requested,
        "fee": fee,
        "fee_formatted": f"${fee} USD" if fee is not None else "",
        "exam_round": {
            "id": rnd.id if rnd else None,
            "round_no": rnd.round_no if rnd else None,
            "title": rnd.title if rnd else None,
            "exam_date": rnd.exam_date.isoformat() if rnd and rnd.exam_date else None,
            "fee_level_i": rnd.fee_level_i if rnd else None,
            "fee_level_ii": rnd.fee_level_ii if rnd else None,
            "fees": {"I": rnd.fee_level_i, "II": rnd.fee_level_ii} if rnd else None,
            "exam_number_visible_at": rnd.exam_number_visible_at.isoformat()
            if rnd and rnd.exam_number_visible_at
            else None,
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
        "cancelled_at": app.cancelled_at.isoformat() if app.cancelled_at else None,
        "submission_cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        "applications": [level],
    }


def _serialize_submission_items(
    sub: ApplicationSubmission,
    rounds: dict[int, ExamRound],
    venues: dict[int, ExamVenue],
    lang: str = "ko",
) -> list[dict]:
    apps_sorted = sorted(sub.applications, key=lambda a: 0 if a.exam_level == "I" else 1)
    return [_serialize_level_item(sub, a, rounds, venues, lang) for a in apps_sorted]


@router.get("/applications")
async def my_applications(
    request: Request,
    lang: str | None = Query(None),
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
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

    locale = resolve_request_locale(request, lang)
    items: list[dict] = []
    for s in submissions:
        items.extend(_serialize_submission_items(s, rounds, venues, locale))
    active = [i for i in items if i["tab"] == "active"]
    past = [i for i in items if i["tab"] == "past"]
    return {"items": items, "active": active, "past": past}


@router.post("/applications/{application_id}/cancel")
async def cancel_application(
    request: Request,
    application_id: int,
    body: dict | None = None,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    lang = resolve_request_locale(request)
    """급수(application) 단위 취소 — 동일 submission의 다른 급수는 유지."""
    result = await db.execute(
        select(Application)
        .where(Application.id == application_id, Application.user_id == auth.id)
        .options(selectinload(Application.submission).selectinload(ApplicationSubmission.applications))
    )
    app = result.scalar_one_or_none()
    if not app:
        raise fo_api_error("NOT_FOUND", "application_not_found", lang, 404)
    if app.cancelled_at or app.status == "cancelled":
        raise fo_api_error("ALREADY_CANCELLED", "already_cancelled", lang, 409)
    if app.payment_status == "paid":
        raise fo_api_error("CANNOT_CANCEL", "cannot_cancel_paid", lang, 400)
    reason = (body or {}).get("reason", "사용자 취소")
    now = datetime.now(timezone.utc)
    app.cancelled_at = now
    app.cancel_reason = reason
    app.status = "cancelled"
    sub = app.submission
    if sub and all(a.status == "cancelled" for a in sub.applications):
        sub.cancelled_at = now
        sub.cancel_reason = reason
        sub.status = "cancelled"
    await db.commit()
    return {"cancelled": True, "application_id": app.id}


@router.post("/application-submissions/{submission_id}/cancel")
async def cancel_submission(
    request: Request,
    submission_id: int,
    body: dict | None = None,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """submission 전체 취소 (하위 모든 급수)."""
    lang = resolve_request_locale(request)
    result = await db.execute(
        select(ApplicationSubmission)
        .where(ApplicationSubmission.id == submission_id, ApplicationSubmission.user_id == auth.id)
        .options(selectinload(ApplicationSubmission.applications))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise fo_api_error("NOT_FOUND", "application_not_found", lang, 404)
    if sub.cancelled_at:
        raise fo_api_error("ALREADY_CANCELLED", "already_cancelled", lang, 409)
    for app in sub.applications:
        if app.status != "cancelled" and app.payment_status == "paid":
            raise fo_api_error("CANNOT_CANCEL", "cannot_cancel_paid", lang, 400)
    reason = (body or {}).get("reason", "사용자 취소")
    now = datetime.now(timezone.utc)
    sub.cancelled_at = now
    sub.cancel_reason = reason
    sub.status = "cancelled"
    for app in sub.applications:
        if app.status == "cancelled":
            continue
        app.cancelled_at = now
        app.cancel_reason = reason
        app.status = "cancelled"
    await db.commit()
    return {"cancelled": True}
