from __future__ import annotations

import secrets
import string
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.lib.audit import write_audit
from app.lib.deps import AuthUser, require_admin, require_any_admin
from app.lib.errors import api_error
from app.lib.security import hash_password
from app.models.admin import AdminAuditLog, AdminUser
from app.models.application import Application, ApplicationMemo, ApplicationSubmission
from app.models.board import BoardComment, BoardPost
from app.models.content import FaqItem, Notice, Term
from app.models.exam import CountryRegionCode, ExamRound, ExamRoundVenue, ExamVenue
from app.models.user import User
from app.routers.exam import serialize_round, serialize_venue

router = APIRouter(prefix="/admin", tags=["admin"])


class RejectBody(BaseModel):
    reject_reason: str | None = None


class PaymentBody(BaseModel):
    receipt_no: str | None = None
    payment_memo: str | None = None
    ignore_capacity: bool = False


class PhotoReviewBody(BaseModel):
    action: str
    photo_reject_code: str | None = None
    photo_reject_note: str | None = None


class ReplyBody(BaseModel):
    body: str
    mark_complete: bool = True


class NoticeBody(BaseModel):
    category: str
    title: str
    body_html: str = ""
    is_pinned: bool = False
    is_published: bool = False


class FaqBody(BaseModel):
    category: str
    question_ko: str
    answer_ko: str
    question_my: str | None = None
    question_en: str | None = None
    answer_my: str | None = None
    answer_en: str | None = None
    is_active: bool = True
    sort_order: int = 0


class TermBody(BaseModel):
    term_type: str
    version: str
    title: str
    body_ko: str
    body_my: str | None = None
    body_en: str | None = None
    effective_at: date | None = None


class RoundBody(BaseModel):
    round_no: int
    title: str
    exam_date: date
    registration_start_at: datetime
    registration_end_at: datetime
    fee_level_i: int
    fee_level_ii: int
    capacity: int
    venue_ids: list[int] = Field(default_factory=list)


class VenueBody(BaseModel):
    venue_code: str
    name_ko: str
    name_en: str | None = None
    address: str | None = None
    country_code: str = "025"
    region_code: str
    capacity: int
    memo: str | None = None


class AssignNumbersBody(BaseModel):
    dry_run: bool = False
    visible_at: datetime | None = None


class WorkflowBody(BaseModel):
    workflow_status: str


class UserPatchBody(BaseModel):
    name_ko: str | None = None
    name_en: str | None = None
    email: str | None = None
    phone: str | None = None
    nationality: str | None = None
    marketing_opt_in: bool | None = None
    status: str | None = None


class AdminUserBody(BaseModel):
    email: str
    password: str
    name: str
    role: str = "admin"
    status: str = "active"


class AdminUserPatchBody(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    status: str | None = None


def _normalize_admin_role(role: str) -> str:
    mapping = {"general": "admin", "viewer": "readonly", "standard": "admin"}
    return mapping.get(role, role)


def _require_super(admin: AuthUser) -> None:
    if admin.role != "super":
        raise api_error("FORBIDDEN", "최고관리자만 수행할 수 있습니다.", 403)


def _board_post_dict(post: BoardPost, user: User | None = None) -> dict:
    return {
        "id": post.id,
        "board_type": post.board_type,
        "user_id": post.user_id,
        "category": post.category,
        "post_type": post.post_type,
        "title": post.title,
        "body": post.body,
        "is_secret": post.is_secret,
        "workflow_status": post.workflow_status,
        "admin_reply": post.admin_reply,
        "admin_replied_at": post.admin_replied_at.isoformat() if post.admin_replied_at else None,
        "admin_replier_id": post.admin_replier_id,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "author_email": user.email if user else None,
        "author_name": user.name_ko if user else None,
        "has_admin_reply": bool(post.admin_reply),
    }


def _term_dict(row: Term) -> dict:
    return {
        "id": row.id,
        "term_type": row.term_type,
        "version": row.version,
        "title": row.title,
        "body_ko": row.body_ko,
        "body_my": row.body_my,
        "body_en": row.body_en,
        "status": row.status,
        "effective_at": row.effective_at.isoformat() if row.effective_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
    }


def _app_row_dict(app: Application, user: User | None = None) -> dict:
    return {
        "id": app.id,
        "submission_id": app.submission_id,
        "user_id": app.user_id,
        "exam_round_id": app.exam_round_id,
        "exam_venue_id": app.exam_venue_id,
        "exam_level": app.exam_level,
        "status": app.status,
        "payment_status": app.payment_status,
        "photo_review_status": app.photo_review_status,
        "exam_number": app.exam_number,
        "application_no": app.application_no,
        "name_ko": user.name_ko if user else None,
        "name_en": user.name_en if user else None,
        "email": user.email if user else None,
        "phone": user.phone if user else None,
        "birth_date": user.birth_date if user else None,
        "gender": user.gender if user else None,
        "reject_reason": app.reject_reason,
        "payment_receipt_no": app.payment_receipt_no,
        "paid_at": app.paid_at.isoformat() if app.paid_at else None,
        "created_at": app.created_at.isoformat() if app.created_at else None,
    }


@router.get("/applications")
async def admin_list_applications(
    exam_round_id: int | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    stmt = select(Application).order_by(Application.id.desc())
    if exam_round_id:
        stmt = stmt.where(Application.exam_round_id == exam_round_id)
    if status:
        stmt = stmt.where(Application.status == status)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    apps = (await db.execute(stmt)).scalars().all()
    user_ids = {a.user_id for a in apps}
    users = {}
    if user_ids:
        res = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u for u in res.scalars().all()}
    return {
        "items": [_app_row_dict(a, users.get(a.user_id)) for a in apps],
        "page": page,
        "page_size": page_size,
    }


@router.get("/applications/{app_id}")
async def admin_get_application(
    app_id: int,
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(Application).where(Application.id == app_id).options(selectinload(Application.memos))
    )
    app = result.scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    user_res = await db.execute(select(User).where(User.id == app.user_id))
    user = user_res.scalar_one_or_none()
    return {
        "application": _app_row_dict(app, user),
        "user": {
            "email": user.email,
            "phone": user.phone,
            "birth_date": user.birth_date,
            "gender": user.gender,
        }
        if user
        else None,
        "memos": [{"id": m.id, "body": m.body, "created_at": m.created_at.isoformat()} for m in app.memos],
    }


@router.post("/applications/{app_id}/approve")
async def approve_application(
    app_id: int,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    before = app.status
    app.status = "approved"
    app.approved_at = datetime.now(timezone.utc)
    await write_audit(db, admin_user_id=admin.id, action_type="approve", target_type="applications", target_id=app_id, before_data={"status": before}, after_data={"status": app.status})
    await db.commit()
    return {"approved": True}


@router.post("/applications/{app_id}/reject")
async def reject_application(
    app_id: int,
    body: RejectBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    app.status = "rejected"
    app.reject_reason = body.reject_reason
    await write_audit(db, admin_user_id=admin.id, action_type="reject", target_type="applications", target_id=app_id, memo=body.reject_reason)
    await db.commit()
    return {"rejected": True}


@router.post("/applications/{app_id}/payment")
async def payment_application(
    app_id: int,
    body: PaymentBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    if app.photo_review_status != "approved":
        raise api_error("PHOTO_NOT_APPROVED", "사진 심사 승인 후 수납할 수 있습니다.", 400)
    app.payment_status = "paid"
    app.status = "approved"
    app.paid_at = datetime.now(timezone.utc)
    app.payment_receipt_no = body.receipt_no
    app.payment_memo = body.payment_memo
    await write_audit(db, admin_user_id=admin.id, action_type="payment_complete", target_type="applications", target_id=app_id)
    await db.commit()
    return {"paid": True}


@router.post("/applications/{app_id}/payment/cancel")
async def cancel_payment(
    app_id: int,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    app.payment_status = "refunded"
    await write_audit(db, admin_user_id=admin.id, action_type="payment_cancel", target_type="applications", target_id=app_id)
    await db.commit()
    return {"refunded": True}


@router.post("/applications/{app_id}/photo-review")
async def photo_review(
    app_id: int,
    body: PhotoReviewBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    if body.action == "approve":
        app.photo_review_status = "approved"
        app.status = "payment_pending"
    elif body.action == "reject":
        app.photo_review_status = "rejected"
        app.photo_reject_code = body.photo_reject_code
        app.photo_reject_note = body.photo_reject_note
        app.status = "photo_review"
    else:
        raise api_error("VALIDATION_ERROR", "action은 approve 또는 reject여야 합니다.")
    await write_audit(db, admin_user_id=admin.id, action_type=f"photo_review_{body.action}", target_type="applications", target_id=app_id)
    await db.commit()
    return {"photo_review_status": app.photo_review_status}


@router.post("/exam-rounds/{round_id}/assign-exam-numbers")
async def assign_exam_numbers(
    round_id: int,
    body: AssignNumbersBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(Application, User)
        .join(User, User.id == Application.user_id)
        .where(
            Application.exam_round_id == round_id,
            Application.payment_status == "paid",
            Application.exam_number.is_(None),
            Application.status != "cancelled",
        )
        .order_by(User.name_en.asc())
    )
    rows = result.all()
    assigned = 0
    preview: list[str] = []
    venue_cache: dict[int, ExamVenue] = {}
    for app, user in rows:
        if app.exam_venue_id not in venue_cache:
            v = (await db.execute(select(ExamVenue).where(ExamVenue.id == app.exam_venue_id))).scalar_one_or_none()
            if not v:
                continue
            venue_cache[app.exam_venue_id] = v
        venue = venue_cache[app.exam_venue_id]
        level_code = "7" if app.exam_level == "I" else "8"
        serial = assigned + 1
        exam_number = f"{venue.country_code}{venue.region_code}{level_code}{venue.venue_code}{serial:04d}"
        preview.append(exam_number)
        if not body.dry_run:
            app.exam_number = exam_number
            app.status = "exam_number_assigned"
            app.exam_number_visible = False
            assigned += 1
    if not body.dry_run:
        rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
        if rnd:
            rnd.exam_numbers_assigned_at = datetime.now(timezone.utc)
            if body.visible_at:
                rnd.exam_number_visible_at = body.visible_at
        await write_audit(db, admin_user_id=admin.id, action_type="exam_number_assign", target_type="exam_rounds", target_id=round_id, after_data={"count": assigned})
        await db.commit()
    return {"dry_run": body.dry_run, "assigned": assigned, "preview": preview[:20]}


@router.get("/exam-rounds")
async def admin_exam_rounds(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(ExamRound).options(selectinload(ExamRound.venue_links)).order_by(ExamRound.round_no.desc()))
    return {"items": [serialize_round(r) for r in result.scalars().all()]}


@router.post("/exam-rounds")
async def create_round(body: RoundBody, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    rnd = ExamRound(
        round_no=body.round_no,
        title=body.title,
        exam_date=body.exam_date,
        registration_start_at=body.registration_start_at,
        registration_end_at=body.registration_end_at,
        fee_level_i=body.fee_level_i,
        fee_level_ii=body.fee_level_ii,
        capacity=body.capacity,
    )
    db.add(rnd)
    await db.flush()
    for vid in body.venue_ids:
        db.add(ExamRoundVenue(exam_round_id=rnd.id, exam_venue_id=vid))
    await write_audit(db, admin_user_id=admin.id, action_type="exam_round_create", target_type="exam_rounds", target_id=rnd.id)
    await db.commit()
    return {"id": rnd.id}


@router.patch("/exam-rounds/{round_id}")
async def update_round(
    round_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    for key in ("title", "exam_date", "registration_start_at", "registration_end_at", "fee_level_i", "fee_level_ii", "capacity", "registration_status"):
        if key in body:
            setattr(rnd, key, body[key])
    if "venue_ids" in body:
        await db.execute(delete(ExamRoundVenue).where(ExamRoundVenue.exam_round_id == round_id))
        for vid in body["venue_ids"]:
            db.add(ExamRoundVenue(exam_round_id=round_id, exam_venue_id=vid))
    await db.commit()
    return {"updated": True}


@router.post("/exam-rounds/{round_id}/status")
async def round_status(
    round_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    status = body.get("registration_status")
    if status not in ("scheduled", "open", "closed"):
        raise api_error("VALIDATION_ERROR", "registration_status가 올바르지 않습니다.")
    rnd.registration_status = status
    await db.commit()
    return {"registration_status": status}


@router.get("/exam-venues")
async def admin_venues(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(ExamVenue).order_by(ExamVenue.venue_code))
    return {"items": [serialize_venue(v) for v in result.scalars().all()]}


@router.patch("/exam-venues/{venue_id}")
async def update_venue(
    venue_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    venue = (await db.execute(select(ExamVenue).where(ExamVenue.id == venue_id))).scalar_one_or_none()
    if not venue:
        raise api_error("NOT_FOUND", "시험장을 찾을 수 없습니다.", 404)
    for key in ("venue_code", "name_ko", "name_en", "address", "region_code", "capacity", "memo", "is_active"):
        if key in body:
            setattr(venue, key, body[key])
    await write_audit(db, admin_user_id=admin.id, action_type="exam_venue_update", target_type="exam_venues", target_id=venue_id)
    await db.commit()
    return {"updated": True}


@router.post("/exam-venues")
async def create_venue(body: VenueBody, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    region = await db.execute(
        select(CountryRegionCode).where(
            CountryRegionCode.country_code == body.country_code,
            CountryRegionCode.region_code == body.region_code,
        )
    )
    if not region.scalar_one_or_none():
        raise api_error("INVALID_REGION", "유효하지 않은 지역 코드입니다.", 400)
    venue = ExamVenue(
        venue_code=body.venue_code,
        name_ko=body.name_ko,
        name_en=body.name_en,
        address=body.address,
        country_code=body.country_code,
        region_code=body.region_code,
        capacity=body.capacity,
        memo=body.memo,
    )
    db.add(venue)
    await db.commit()
    return {"id": venue.id}


@router.get("/notices")
async def admin_notices(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(Notice).order_by(Notice.id.desc()))
    return {
        "items": [
            {
                "id": n.id,
                "category": n.category,
                "title": n.title,
                "body_html": n.body_html,
                "is_published": n.is_published,
                "is_pinned": n.is_pinned,
                "published_at": n.published_at.isoformat() if n.published_at else None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "view_count": n.view_count,
            }
            for n in result.scalars().all()
        ]
    }


@router.post("/notices")
async def create_notice(body: NoticeBody, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    notice = Notice(
        category=body.category,
        title=body.title,
        body_html=body.body_html,
        is_pinned=body.is_pinned,
        is_published=body.is_published,
        author_admin_id=admin.id,
        published_at=datetime.now(timezone.utc) if body.is_published else None,
    )
    db.add(notice)
    await db.commit()
    return {"id": notice.id}


@router.patch("/notices/{notice_id}")
async def update_notice(
    notice_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    notice = (await db.execute(select(Notice).where(Notice.id == notice_id))).scalar_one_or_none()
    if not notice:
        raise api_error("NOT_FOUND", "공지를 찾을 수 없습니다.", 404)
    for key in ("category", "title", "body_html", "is_pinned", "is_published"):
        if key in body:
            setattr(notice, key, body[key])
    if body.get("is_published") and not notice.published_at:
        notice.published_at = datetime.now(timezone.utc)
    await db.commit()
    return {"updated": True}


@router.get("/faq")
async def admin_faq(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(FaqItem).order_by(FaqItem.sort_order, FaqItem.id))
    return {
        "items": [
            {
                "id": f.id,
                "category": f.category,
                "question_ko": f.question_ko,
                "answer_ko": f.answer_ko,
                "question_my": f.question_my,
                "question_en": f.question_en,
                "answer_my": f.answer_my,
                "answer_en": f.answer_en,
                "is_active": f.is_active,
                "sort_order": f.sort_order,
            }
            for f in result.scalars().all()
        ]
    }


@router.post("/faq")
async def create_faq(body: FaqBody, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    row = FaqItem(**body.model_dump())
    db.add(row)
    await db.commit()
    return {"id": row.id}


@router.patch("/faq/{faq_id}")
async def update_faq(
    faq_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (await db.execute(select(FaqItem).where(FaqItem.id == faq_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "FAQ를 찾을 수 없습니다.", 404)
    for key in (
        "category",
        "question_ko",
        "answer_ko",
        "question_my",
        "question_en",
        "answer_my",
        "answer_en",
        "is_active",
        "sort_order",
    ):
        if key in body:
            setattr(row, key, body[key])
    await db.commit()
    return {"updated": True}


@router.get("/terms")
async def admin_terms(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(Term).order_by(Term.term_type, Term.id.desc()))
    return {"items": [_term_dict(t) for t in result.scalars().all()]}


@router.get("/terms/{term_id}")
async def get_term(
    term_id: int,
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    return {"term": _term_dict(row)}


@router.post("/terms")
async def create_term(body: TermBody, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    row = Term(**body.model_dump(), status="draft")
    db.add(row)
    await db.flush()
    await write_audit(db, admin_user_id=admin.id, action_type="term_create", target_type="terms", target_id=row.id)
    await db.commit()
    return {"id": row.id}


@router.patch("/terms/{term_id}")
async def update_term(
    term_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    if row.status != "draft":
        raise api_error("VALIDATION_ERROR", "게시된 약관은 수정할 수 없습니다.", 400)
    for key in ("term_type", "version", "title", "body_ko", "body_my", "body_en", "effective_at"):
        if key in body:
            setattr(row, key, body[key])
    await write_audit(db, admin_user_id=admin.id, action_type="term_update", target_type="terms", target_id=term_id)
    await db.commit()
    return {"updated": True}


@router.post("/terms/{term_id}/retire")
async def retire_term(term_id: int, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    row = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    if row.status != "published":
        raise api_error("VALIDATION_ERROR", "게시 중인 약관만 폐지할 수 있습니다.", 400)
    row.status = "retired"
    await write_audit(db, admin_user_id=admin.id, action_type="term_retire", target_type="terms", target_id=term_id)
    await db.commit()
    return {"retired": True}


@router.post("/terms/{term_id}/publish")
async def publish_term(term_id: int, admin: AuthUser = Depends(require_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    row = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    await db.execute(update(Term).where(Term.term_type == row.term_type, Term.status == "published").values(status="retired"))
    row.status = "published"
    row.published_at = datetime.now(timezone.utc)
    await write_audit(db, admin_user_id=admin.id, action_type="term_publish", target_type="terms", target_id=term_id)
    await db.commit()
    return {"published": True}


@router.get("/board/posts")
async def admin_list_board_posts(
    board_type: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    stmt = (
        select(BoardPost, User)
        .join(User, User.id == BoardPost.user_id)
        .where(BoardPost.board_type == board_type)
        .order_by(BoardPost.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()
    return {
        "items": [_board_post_dict(post, user) for post, user in rows],
        "page": page,
        "page_size": page_size,
    }


@router.get("/board/posts/{post_id}")
async def admin_get_board_post(
    post_id: int,
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(BoardPost, User)
        .join(User, User.id == BoardPost.user_id)
        .where(BoardPost.id == post_id)
    )
    row = result.first()
    if not row:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    post, user = row
    comments_res = await db.execute(
        select(BoardComment)
        .where(BoardComment.board_post_id == post_id, BoardComment.is_deleted.is_(False))
        .order_by(BoardComment.created_at)
    )
    comments = [
        {
            "id": c.id,
            "body": c.body,
            "author_admin_id": c.author_admin_id,
            "author_user_id": c.author_user_id,
            "is_secret": c.is_secret,
            "created_at": c.created_at.isoformat(),
        }
        for c in comments_res.scalars().all()
    ]
    data = _board_post_dict(post, user)
    data["comments"] = comments
    return {"post": data}


@router.delete("/board/posts/{post_id}")
async def delete_board_post(
    post_id: int,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = (await db.execute(select(BoardPost).where(BoardPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    await db.delete(post)
    await write_audit(db, admin_user_id=admin.id, action_type="board_delete", target_type="board_posts", target_id=post_id)
    await db.commit()
    return {"deleted": True}


@router.patch("/board/posts/{post_id}/workflow")
async def board_workflow(
    post_id: int,
    body: WorkflowBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = (await db.execute(select(BoardPost).where(BoardPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    allowed = (
        {"received", "in_review", "completed", "rejected"}
        if post.board_type == "refund_correction"
        else {"awaiting_reply", "answered"}
    )
    if body.workflow_status not in allowed:
        raise api_error("VALIDATION_ERROR", "workflow_status가 올바르지 않습니다.", 400)
    before = post.workflow_status
    post.workflow_status = body.workflow_status
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="board_workflow",
        target_type="board_posts",
        target_id=post_id,
        before_data={"workflow_status": before},
        after_data={"workflow_status": post.workflow_status},
    )
    await db.commit()
    return {"workflow_status": post.workflow_status}


@router.post("/board/posts/{post_id}/reply")
async def reply_post(
    post_id: int,
    body: ReplyBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = (await db.execute(select(BoardPost).where(BoardPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    post.admin_reply = body.body.strip()
    post.admin_replied_at = datetime.now(timezone.utc)
    post.admin_replier_id = admin.id
    if body.mark_complete:
        post.workflow_status = "answered" if post.board_type == "inquiry" else "completed"
    await write_audit(db, admin_user_id=admin.id, action_type="board_reply", target_type="board_posts", target_id=post_id)
    await db.commit()
    return {"replied": True}


@router.get("/users")
async def admin_users(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(User).order_by(User.id.desc()).limit(200))
    return {
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "name_ko": u.name_ko,
                "name_en": u.name_en,
                "phone": u.phone,
                "nationality": u.nationality,
                "status": u.status,
                "marketing_opt_in": u.marketing_opt_in,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in result.scalars().all()
        ]
    }


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UserPatchBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "회원을 찾을 수 없습니다.", 404)
    before = {"status": user.status, "email": user.email}
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in ("active", "suspended", "withdrawn"):
        raise api_error("VALIDATION_ERROR", "status가 올바르지 않습니다.", 400)
    for key, val in data.items():
        setattr(user, key, val)
    if data.get("status") == "withdrawn":
        user.withdrawn_at = datetime.now(timezone.utc)
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="user_update",
        target_type="users",
        target_id=user_id,
        before_data=before,
        after_data=data,
    )
    await db.commit()
    return {"updated": True}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "회원을 찾을 수 없습니다.", 404)
    alphabet = string.ascii_letters + string.digits
    temp = "tpkm" + "".join(secrets.choice(alphabet) for _ in range(8))
    user.password_hash = hash_password(temp)
    user.password_changed_at = None
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="user_reset_password",
        target_type="users",
        target_id=user_id,
        memo=f"임시 비밀번호 발급 ({user.email})",
    )
    await db.commit()
    return {"temp_password": temp}


@router.get("/admin-users")
async def list_admin_users(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(AdminUser).order_by(AdminUser.id))
    return {
        "items": [
            {
                "id": a.id,
                "email": a.email,
                "name": a.name,
                "role": a.role,
                "status": a.status,
                "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
            }
            for a in result.scalars().all()
        ]
    }


@router.post("/admin-users")
async def create_admin_user(
    body: AdminUserBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)
    email = body.email.strip().lower()
    exists = await db.execute(select(AdminUser).where(AdminUser.email == email))
    if exists.scalar_one_or_none():
        raise api_error("DUPLICATE", "이미 사용 중인 이메일입니다.", 409)
    row = AdminUser(
        email=email,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        role=_normalize_admin_role(body.role),
        status=body.status,
        must_change_password=True,
    )
    db.add(row)
    await db.flush()
    await write_audit(db, admin_user_id=admin.id, action_type="admin_create", target_type="admin_users", target_id=row.id)
    await db.commit()
    return {"id": row.id}


@router.patch("/admin-users/{admin_id}")
async def update_admin_user(
    admin_id: int,
    body: AdminUserPatchBody,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)
    row = (await db.execute(select(AdminUser).where(AdminUser.id == admin_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "관리자를 찾을 수 없습니다.", 404)
    if admin_id == admin.id and body.status == "inactive":
        raise api_error("VALIDATION_ERROR", "본인 계정은 비활성화할 수 없습니다.", 400)
    data = body.model_dump(exclude_unset=True)
    if "role" in data:
        data["role"] = _normalize_admin_role(data["role"])
    if "email" in data:
        data["email"] = data["email"].strip().lower()
    for key, val in data.items():
        setattr(row, key, val)
    await write_audit(db, admin_user_id=admin.id, action_type="admin_update", target_type="admin_users", target_id=admin_id)
    await db.commit()
    return {"updated": True}


@router.post("/admin-users/{admin_id}/reset-password")
async def reset_admin_password(
    admin_id: int,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    if admin_id != admin.id:
        _require_super(admin)
    row = (await db.execute(select(AdminUser).where(AdminUser.id == admin_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "관리자를 찾을 수 없습니다.", 404)
    alphabet = string.ascii_letters + string.digits
    temp = "tpkm" + "".join(secrets.choice(alphabet) for _ in range(8))
    row.password_hash = hash_password(temp)
    row.must_change_password = True
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="admin_reset_password",
        target_type="admin_users",
        target_id=admin_id,
        memo=f"임시 비밀번호 발급 ({row.email})",
    )
    await db.commit()
    return {"temp_password": temp}


@router.get("/audit-logs")
async def audit_logs(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(200))
    logs = result.scalars().all()
    admin_ids = {l.admin_user_id for l in logs if l.admin_user_id}
    admins = {}
    if admin_ids:
        res = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a for a in res.scalars().all()}
    return {
        "items": [
            {
                "id": l.id,
                "admin_user_id": l.admin_user_id,
                "admin_email": admins[l.admin_user_id].email if l.admin_user_id and l.admin_user_id in admins else None,
                "action_type": l.action_type,
                "target_type": l.target_type,
                "target_id": l.target_id,
                "memo": l.memo,
                "before_data": l.before_data,
                "after_data": l.after_data,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }


@router.get("/region-codes")
async def region_codes(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(CountryRegionCode).order_by(CountryRegionCode.country_code, CountryRegionCode.region_code))
    return {
        "items": [
            {"country_code": r.country_code, "region_code": r.region_code, "name_ko": r.name_ko, "name_en": r.name_en}
            for r in result.scalars().all()
        ]
    }
