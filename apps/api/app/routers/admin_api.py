from __future__ import annotations

import csv
import io
import re
import secrets
import string
import zipfile
from urllib.parse import quote
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Header, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.lib.audit import write_audit
from app.lib.board_helpers import build_comment_tree, official_replies_for_post, parse_parent_comment_id, resolve_comment_is_secret
from app.lib.deps import (
    AuthUser,
    get_client_ip,
    require_admin,
    require_admin_base,
    require_any_admin,
)
from app.lib.errors import api_error
from app.lib.translate import translate_text
from app.lib.formatting import board_status_label, fmt_date, fmt_datetime
from app.config import get_settings
from app.lib.email_notify import (
    notify_account_status,
    notify_application_approved,
    notify_application_rejected,
    notify_board_reply,
    notify_board_workflow_changed,
    notify_member_info_changed,
    notify_notice_marketing,
    notify_photo_rejected,
    notify_temp_password,
    resolve_admin_notify_email,
    count_active_applications,
)
from app.lib.profile import is_full_member
from app.lib.rev import bump_rev, check_rev, expected_rev_from_request
from app.lib.roster_export import build_roster_zip, group_roster_rows
from app.lib.security import hash_password, verify_password
from app.lib.storage import delete_file, read_file_bytes, save_upload
from app.lib.validation import is_valid_password
from app.lib.admin_permissions import (
    assert_perm,
    board_menu_for_type,
    get_matrix_row,
    load_matrix,
    matrix_perm,
    perm_schema,
    role_has,
    save_matrix,
)
from app.models.admin import AdminAuditLog, AdminPermissionMatrix, AdminUser
from app.models.application import Application, ApplicationMemo, ApplicationSubmission
from app.models.board import BoardComment, BoardPost
from app.models.content import FaqItem, Notice, Term, TermConsent
from app.models.exam import CountryRegionCode, ExamRound, ExamRoundVenue, ExamVenue
from app.models.system import FileAttachment
from app.models.user import User
from app.lib.exam_round_status import sync_exam_round_status, sync_exam_rounds_status
from app.routers.exam import serialize_round, serialize_venue

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

MARKETING_BATCH_LIMIT = 500

_NOTICE_ATTACH_MAX_COUNT = 5
_NOTICE_ATTACH_MAX_BYTES = 10 * 1024 * 1024
_NOTICE_ATTACH_OWNER = "notice"
_NOTICE_ATTACH_PENDING = "notice_attachment_pending"
_NOTICE_ATTACH_EXT = re.compile(
    r"\.(jpe?g|png|gif|webp|bmp|pdf|docx?|xlsx?|pptx?|hwp|hwpx|txt|zip|csv)$",
    re.IGNORECASE,
)
_ALLOWED_NOTICE_ATTACH: dict[str, tuple[str, ...]] = {
    "image/jpeg": (".jpg", ".jpeg"),
    "image/png": (".png",),
    "image/gif": (".gif",),
    "image/webp": (".webp",),
    "image/bmp": (".bmp",),
    "application/pdf": (".pdf",),
    "application/msword": (".doc",),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (".docx",),
    "application/vnd.ms-excel": (".xls",),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (".xlsx",),
    "application/vnd.ms-powerpoint": (".ppt",),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": (".pptx",),
    "application/x-hwp": (".hwp",),
    "application/haansofthwp": (".hwp",),
    "application/vnd.hancom.hwp": (".hwp",),
    "application/vnd.hancom.hwpx": (".hwpx",),
    "text/plain": (".txt",),
    "application/zip": (".zip",),
    "application/x-zip-compressed": (".zip",),
    "text/csv": (".csv",),
}


def _attachment_disposition(filename: str) -> str:
    ascii_name = "".join(c if ord(c) < 128 else "_" for c in filename) or "download"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'


class RejectBody(BaseModel):
    reject_reason: str | None = None
    rev: int | None = None


class PaymentBody(BaseModel):
    receipt_no: str | None = None
    payment_memo: str | None = None
    ignore_capacity: bool = False
    rev: int | None = None


class PaymentCancelBody(BaseModel):
    payment_cancel_reason: str | None = None
    rev: int | None = None


class PermissionMatrixPutBody(BaseModel):
    matrix: dict


class PhotoReviewBody(BaseModel):
    action: str
    photo_reject_code: str | None = None
    photo_reject_note: str | None = None
    rev: int | None = None


class RevBody(BaseModel):
    rev: int | None = None


class ReplyBody(BaseModel):
    body: str
    mark_complete: bool = True


def _parse_optional_datetime(val) -> datetime | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        text = val.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            raise api_error("VALIDATION_ERROR", "날짜 형식이 올바르지 않습니다.", 400)
    raise api_error("VALIDATION_ERROR", "날짜 형식이 올바르지 않습니다.", 400)


def _validate_notice_display_window(start: datetime | None, end: datetime | None) -> None:
    if start and end and end <= start:
        raise api_error("VALIDATION_ERROR", "노출 종료는 노출 시작 이후여야 합니다.", 400)


class NoticeBody(BaseModel):
    category: str
    title: str
    title_my: str | None = None
    title_en: str | None = None
    body_html: str = ""
    body_my: str | None = None
    body_en: str | None = None
    is_pinned: bool = False
    is_published: bool = False
    display_start_at: datetime | None = None
    display_end_at: datetime | None = None
    attachment_file_ids: list[int] = []
    remove_attachment_file_ids: list[int] = []


_NOTICE_TRASH_RETENTION_DAYS = 30


def _notice_row_dict(n: Notice, attachments: list[dict] | None = None) -> dict:
    return {
        "id": n.id,
        "category": n.category,
        "title": n.title,
        "title_my": n.title_my,
        "title_en": n.title_en,
        "body_html": n.body_html,
        "body_my": n.body_my,
        "body_en": n.body_en,
        "is_published": n.is_published,
        "is_pinned": n.is_pinned,
        "display_start_at": n.display_start_at.isoformat() if n.display_start_at else None,
        "display_end_at": n.display_end_at.isoformat() if n.display_end_at else None,
        "is_deleted": n.is_deleted,
        "deleted_at": n.deleted_at.isoformat() if n.deleted_at else None,
        "published_at": n.published_at.isoformat() if n.published_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "view_count": n.view_count,
        "attachments": attachments or [],
    }


async def _purge_expired_notice_trash(db: AsyncSession) -> int:
    """휴지통 30일 경과 공지 영구 삭제."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=_NOTICE_TRASH_RETENTION_DAYS)
    expired = (
        await db.execute(
            select(Notice.id).where(Notice.is_deleted.is_(True), Notice.deleted_at.isnot(None), Notice.deleted_at < cutoff)
        )
    ).scalars().all()
    if not expired:
        return 0
    await db.execute(delete(Notice).where(Notice.id.in_(expired)))
    return len(expired)


def _notice_attachment_dict(row: FileAttachment) -> dict:
    return {
        "file_id": row.id,
        "filename": row.original_filename or "file",
        "size": row.size_bytes,
        "url": f"/api/v1/files/{row.id}",
    }


async def _attachments_for_notice(db: AsyncSession, notice_id: int) -> list[dict]:
    res = await db.execute(
        select(FileAttachment).where(
            FileAttachment.owner_type == _NOTICE_ATTACH_OWNER,
            FileAttachment.owner_id == notice_id,
        )
    )
    return [_notice_attachment_dict(f) for f in res.scalars().all()]


def _notice_attachment_allowed(content_type: str, filename: str) -> bool:
    ct = (content_type or "").lower()
    if ct in _ALLOWED_NOTICE_ATTACH:
        return True
    return bool(_NOTICE_ATTACH_EXT.search(filename or ""))


def _guess_notice_mime(filename: str) -> str:
    lower = (filename or "").lower()
    for mime, exts in _ALLOWED_NOTICE_ATTACH.items():
        if any(lower.endswith(ext) for ext in exts):
            return mime
    return "application/octet-stream"


async def _apply_notice_attachments(
    db: AsyncSession,
    *,
    notice_id: int,
    admin_id: int,
    add_ids: list[int],
    remove_ids: list[int],
) -> None:
    if remove_ids:
        res = await db.execute(
            select(FileAttachment).where(
                FileAttachment.id.in_(remove_ids),
                FileAttachment.owner_type == _NOTICE_ATTACH_OWNER,
                FileAttachment.owner_id == notice_id,
            )
        )
        for row in res.scalars().all():
            delete_file(row.storage_key)
            await db.delete(row)

    if add_ids:
        res = await db.execute(
            select(FileAttachment).where(
                FileAttachment.id.in_(add_ids),
                FileAttachment.owner_type == _NOTICE_ATTACH_PENDING,
                FileAttachment.owner_id == admin_id,
            )
        )
        for row in res.scalars().all():
            row.owner_type = _NOTICE_ATTACH_OWNER
            row.owner_id = notice_id

    total = (
        await db.execute(
            select(func.count())
            .select_from(FileAttachment)
            .where(
                FileAttachment.owner_type == _NOTICE_ATTACH_OWNER,
                FileAttachment.owner_id == notice_id,
            )
        )
    ).scalar() or 0
    if total > _NOTICE_ATTACH_MAX_COUNT:
        raise api_error(
            "VALIDATION_ERROR",
            f"첨부파일은 최대 {_NOTICE_ATTACH_MAX_COUNT}개까지 등록할 수 있습니다.",
            400,
        )


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


class RoundPatchBody(BaseModel):
    round_no: int | None = None
    title: str | None = None
    exam_date: date | None = None
    registration_start_at: datetime | None = None
    registration_end_at: datetime | None = None
    fee_level_i: int | None = None
    fee_level_ii: int | None = None
    capacity: int | None = None
    registration_status: str | None = None
    exam_number_visible_at: datetime | None = None
    venue_ids: list[int] | None = None


class TranslateBody(BaseModel):
    text: str
    source: str = "ko"
    target: str = "my"


class VenueBody(BaseModel):
    venue_code: str
    name_ko: str
    name_en: str | None = None
    name_my: str | None = None
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
    rev: int | None = None
    memo: str | None = None  # 처리 사유(BO 회원 수정·정지·탈퇴) — audit 기록용


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
        "locked": False,  # 관리자는 비밀글도 열람 가능
        "workflow_status": post.workflow_status,
        "status_label": board_status_label(post.workflow_status),
        "admin_reply": post.admin_reply,
        "admin_replied_at": post.admin_replied_at.isoformat() if post.admin_replied_at else None,
        "admin_replier_id": post.admin_replier_id,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "date_formatted": fmt_date(post.created_at),
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


def _app_row_dict(
    app: Application,
    user: User | None = None,
    venue: ExamVenue | None = None,
    rnd: ExamRound | None = None,
) -> dict:
    return {
        "id": app.id,
        "submission_id": app.submission_id,
        "user_id": app.user_id,
        "exam_round_id": app.exam_round_id,
        "exam_venue_id": app.exam_venue_id,
        "exam_level": app.exam_level,
        "status": app.status,
        "approved_at": app.approved_at.isoformat() if app.approved_at else None,
        "payment_status": app.payment_status,
        "photo_review_status": app.photo_review_status,
        "photo_reject_code": app.photo_reject_code,
        "photo_reject_note": app.photo_reject_note,
        "photo_file_id": app.photo_file_id,
        "exam_number": app.exam_number,
        "exam_number_visible": app.exam_number_visible,
        "application_no": app.application_no,
        # --- 연명부 10개 컬럼 채울 필드(계약서 3절) ---
        "name_ko": user.name_ko if user else None,
        "name_en": user.name_en if user else None,
        "birth_date": user.birth_date if user else None,
        "gender": user.gender if user else None,
        "nationality": user.nationality if user else None,
        "first_language": user.first_language if user else None,
        "job_code": user.job_code if user else None,
        "motive_code": user.motive_code if user else None,
        "purpose_code": user.purpose_code if user else None,
        # --- 지역/시험장/수준 ---
        "country_code": venue.country_code if venue else None,
        "region_code": venue.region_code if venue else None,
        "venue_code": venue.venue_code if venue else None,
        "venue_name": venue.name_ko if venue else None,
        "venue_name_en": venue.name_en if venue else None,
        "round_no": rnd.round_no if rnd else None,
        "round_title": rnd.title if rnd else None,
        # --- 연락/처리 ---
        "email": user.email if user else None,
        "phone": user.phone if user else None,
        "reject_reason": app.reject_reason,
        "payment_receipt_no": app.payment_receipt_no,
        "paid_at": app.paid_at.isoformat() if app.paid_at else None,
        "created_at": app.created_at.isoformat() if app.created_at else None,
        "rev": app.rev,
    }


async def _load_app_refs(
    db: AsyncSession, apps: list[Application]
) -> tuple[dict[int, User], dict[int, ExamVenue], dict[int, ExamRound]]:
    user_ids = {a.user_id for a in apps}
    venue_ids = {a.exam_venue_id for a in apps}
    round_ids = {a.exam_round_id for a in apps}
    users: dict[int, User] = {}
    venues: dict[int, ExamVenue] = {}
    rounds: dict[int, ExamRound] = {}
    if user_ids:
        res = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u for u in res.scalars().all()}
    if venue_ids:
        res = await db.execute(select(ExamVenue).where(ExamVenue.id.in_(venue_ids)))
        venues = {v.id: v for v in res.scalars().all()}
    if round_ids:
        res = await db.execute(select(ExamRound).where(ExamRound.id.in_(round_ids)))
        rounds = {r.id: r for r in res.scalars().all()}
    return users, venues, rounds


@router.get("/applications")
async def admin_list_applications(
    exam_round_id: int | None = Query(None),
    exam_venue_id: int | None = Query(None),
    exam_level: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    stmt = select(Application).order_by(Application.id.desc())
    if exam_round_id:
        stmt = stmt.where(Application.exam_round_id == exam_round_id)
    if exam_venue_id:
        stmt = stmt.where(Application.exam_venue_id == exam_venue_id)
    if exam_level:
        stmt = stmt.where(Application.exam_level == exam_level)
    if status:
        stmt = stmt.where(Application.status == status)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    apps = (await db.execute(stmt)).scalars().all()
    users, venues, rounds = await _load_app_refs(db, apps)
    return {
        "items": [
            _app_row_dict(a, users.get(a.user_id), venues.get(a.exam_venue_id), rounds.get(a.exam_round_id))
            for a in apps
        ],
        "page": page,
        "page_size": page_size,
    }


_LEVEL_FOLDER = {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"}


def _safe_seg(value: str | None, fallback: str) -> str:
    """zip 경로 세그먼트 안전화(슬래시 등 제거)."""
    v = (value or "").strip() or fallback
    return re.sub(r'[\\/:*?"<>|]+', "_", v)


@router.get("/applications/photos.zip")
async def export_photos_zip(
    round_id: int | None = Query(None),
    venue_id: int | None = Query(None),
    level: str | None = Query(None),
    admin: AuthUser = Depends(matrix_perm("applicants", "export")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
):
    """실제 사진을 {지역}/{시험장}/{수준}/{수험번호}.jpg 구조로 zip 스트리밍(계약서 4절).

    수험번호 미부여/사진 없음은 _누락리포트.txt 에 기록.
    """
    stmt = select(Application).where(Application.status != "cancelled")
    if round_id:
        stmt = stmt.where(Application.exam_round_id == round_id)
    if venue_id:
        stmt = stmt.where(Application.exam_venue_id == venue_id)
    if level:
        stmt = stmt.where(Application.exam_level == level)
    apps = (await db.execute(stmt)).scalars().all()

    users, venues, _rounds = await _load_app_refs(db, apps)

    # 지역명(한글) 조회.
    region_names: dict[tuple[str, str], str] = {}
    if venues:
        rres = await db.execute(select(CountryRegionCode))
        for rc in rres.scalars().all():
            region_names[(rc.country_code, rc.region_code)] = rc.name_ko

    # file_attachments 조회.
    file_ids = {a.photo_file_id for a in apps if a.photo_file_id}
    files: dict[int, FileAttachment] = {}
    if file_ids:
        fres = await db.execute(select(FileAttachment).where(FileAttachment.id.in_(file_ids)))
        files = {f.id: f for f in fres.scalars().all()}

    buf = io.BytesIO()
    included = 0
    missing: list[str] = []
    seen_names: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for app in apps:
            user = users.get(app.user_id)
            venue = venues.get(app.exam_venue_id)
            who = (user.name_en if user else None) or (user.name_ko if user else None) or f"app#{app.id}"
            if not app.exam_number:
                missing.append(f"[수험번호 미부여] {who} (app_id={app.id}, level={app.exam_level})")
                continue
            f = files.get(app.photo_file_id) if app.photo_file_id else None
            data = read_file_bytes(f.storage_key) if f else None
            if not data:
                missing.append(f"[사진 없음] {app.exam_number} {who} (app_id={app.id})")
                continue
            region = _safe_seg(
                region_names.get((venue.country_code, venue.region_code)) if venue else None,
                venue.region_code if venue else "지역",
            )
            venue_seg = _safe_seg(venue.name_ko if venue else None, venue.venue_code if venue else "시험장")
            level_seg = _safe_seg(_LEVEL_FOLDER.get(app.exam_level, app.exam_level), app.exam_level)
            arcname = f"{region}/{venue_seg}/{level_seg}/{app.exam_number}.jpg"
            if arcname in seen_names:
                arcname = f"{region}/{venue_seg}/{level_seg}/{app.exam_number}_{app.id}.jpg"
            seen_names.add(arcname)
            zf.writestr(arcname, data)
            included += 1

        report = [
            "TOPIK Myanmar 사진 제출 zip — 누락 리포트",
            f"생성: {datetime.now(timezone.utc).isoformat()}",
            f"필터: round_id={round_id}, venue_id={venue_id}, level={level}",
            f"포함 사진: {included}건 / 누락: {len(missing)}건",
            "",
        ]
        report.extend(missing if missing else ["(누락 없음)"])
        zf.writestr("_누락리포트.txt", "\n".join(report).encode("utf-8"))

    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="photos_export",
        target_type="exam_rounds",
        target_id=round_id or 0,
        after_data={"included": included, "missing": len(missing)},
        ip_address=ip,
    )
    await db.commit()

    buf.seek(0)
    fname = f"topik_photos_round{round_id or 'all'}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/exam-rounds/{round_id}/roster.xlsx")
async def export_roster_xlsx(
    round_id: int,
    admin: AuthUser = Depends(matrix_perm("applicants", "export")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
):
    """연명부 xlsx zip — 지역·시험장·수준별 파일 (계약서 3절)."""
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    apps = (
        await db.execute(
            select(Application).where(
                Application.exam_round_id == round_id,
                Application.status != "cancelled",
            )
        )
    ).scalars().all()
    users, venues, _rounds = await _load_app_refs(db, apps)
    region_names: dict[tuple[str, str], str] = {}
    rres = await db.execute(select(CountryRegionCode))
    for rc in rres.scalars().all():
        region_names[(rc.country_code, rc.region_code)] = rc.name_ko

    row_dicts = [
        _app_row_dict(a, users.get(a.user_id), venues.get(a.exam_venue_id), rnd)
        for a in apps
    ]
    groups = group_roster_rows(row_dicts, region_names=region_names)
    zip_bytes, zip_name = build_roster_zip(round_no=rnd.round_no, groups=groups)

    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="roster_export",
        target_type="exam_rounds",
        target_id=round_id,
        after_data={"files": len(groups), "rows": len(row_dicts)},
        ip_address=ip,
    )
    await db.commit()

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": _attachment_disposition(zip_name)},
    )


@router.get("/exam-rounds/{round_id}/photos.zip")
async def export_round_photos_zip(
    round_id: int,
    venue_id: int | None = Query(None),
    level: str | None = Query(None),
    admin: AuthUser = Depends(matrix_perm("applicants", "export")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
):
    """회차 단위 사진 zip (query-param 경로 alias)."""
    return await export_photos_zip(
        round_id=round_id,
        venue_id=venue_id,
        level=level,
        admin=admin,
        ip=ip,
        db=db,
    )


async def _serialize_audit_logs(db: AsyncSession, logs: list[AdminAuditLog]) -> list[dict]:
    admin_ids = {l.admin_user_id for l in logs if l.admin_user_id}
    admins: dict[int, AdminUser] = {}
    if admin_ids:
        res = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a for a in res.scalars().all()}
    return [
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
    venue = (await db.execute(select(ExamVenue).where(ExamVenue.id == app.exam_venue_id))).scalar_one_or_none()
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == app.exam_round_id))).scalar_one_or_none()
    audit_res = await db.execute(
        select(AdminAuditLog)
        .where(
            AdminAuditLog.target_type == "applications",
            AdminAuditLog.target_id == str(app_id),
        )
        .order_by(AdminAuditLog.created_at.desc())
        .limit(100)
    )
    audit_logs = audit_res.scalars().all()
    return {
        "application": _app_row_dict(app, user, venue, rnd),
        "user": {
            "email": user.email,
            "phone": user.phone,
            "birth_date": user.birth_date,
            "gender": user.gender,
            "nationality": user.nationality,
            "first_language": user.first_language,
            "job_code": user.job_code,
            "motive_code": user.motive_code,
            "purpose_code": user.purpose_code,
            "photo_file_id": user.photo_file_id,
        }
        if user
        else None,
        "memos": [{"id": m.id, "body": m.body, "created_at": m.created_at.isoformat()} for m in app.memos],
        "audit_logs": await _serialize_audit_logs(db, audit_logs),
    }


@router.post("/applications/{app_id}/approve")
async def approve_application(
    app_id: int,
    request: Request,
    body: RevBody | None = None,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: AuthUser = Depends(matrix_perm("applicants", "approve")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    check_rev(app, expected_rev_from_request(request, body.rev if body else None, if_match), label="접수")
    before = app.status
    app.status = "approved"
    app.approved_at = datetime.now(timezone.utc)
    bump_rev(app)
    user = (await db.execute(select(User).where(User.id == app.user_id))).scalar_one_or_none()
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == app.exam_round_id))).scalar_one_or_none()
    venue = (await db.execute(select(ExamVenue).where(ExamVenue.id == app.exam_venue_id))).scalar_one_or_none()
    if user and rnd:
        await notify_application_approved(db, app, user, rnd, venue)
    await write_audit(db, admin_user_id=admin.id, action_type="approve", target_type="applications", target_id=app_id, before_data={"status": before}, after_data={"status": app.status})
    await db.commit()
    return {"approved": True, "rev": app.rev}


@router.post("/applications/{app_id}/reject")
async def reject_application(
    app_id: int,
    body: RejectBody,
    request: Request,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: AuthUser = Depends(matrix_perm("applicants", "reject")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    check_rev(app, expected_rev_from_request(request, body.rev, if_match), label="접수")
    app.status = "rejected"
    app.reject_reason = body.reject_reason
    bump_rev(app)
    user = (await db.execute(select(User).where(User.id == app.user_id))).scalar_one_or_none()
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == app.exam_round_id))).scalar_one_or_none()
    if user and rnd:
        await notify_application_rejected(db, app, user, rnd, reject_reason=body.reject_reason)
    await write_audit(db, admin_user_id=admin.id, action_type="reject", target_type="applications", target_id=app_id, memo=body.reject_reason)
    await db.commit()
    return {"rejected": True, "rev": app.rev}


@router.post("/applications/{app_id}/payment")
async def payment_application(
    app_id: int,
    body: PaymentBody,
    request: Request,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: AuthUser = Depends(matrix_perm("applicants", "pay")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    check_rev(app, expected_rev_from_request(request, body.rev, if_match), label="접수")
    if app.photo_review_status != "approved":
        raise api_error("PHOTO_NOT_APPROVED", "사진 심사 승인 후 수납할 수 있습니다.", 400)
    app.payment_status = "paid"
    # 수납 완료 ≠ 승인처리 완료 — 승인은 별도 /approve 엔드포인트에서만 반영
    if app.status not in ("approved", "exam_number_assigned", "rejected", "cancelled"):
        app.status = "payment_pending"
    app.paid_at = datetime.now(timezone.utc)
    app.payment_receipt_no = body.receipt_no
    app.payment_memo = body.payment_memo
    bump_rev(app)
    await write_audit(db, admin_user_id=admin.id, action_type="payment_complete", target_type="applications", target_id=app_id)
    await db.commit()
    return {"paid": True, "rev": app.rev}


@router.post("/applications/{app_id}/payment/cancel")
async def cancel_payment(
    app_id: int,
    body: PaymentCancelBody,
    request: Request,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: AuthUser = Depends(matrix_perm("applicants", "pay")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    check_rev(app, expected_rev_from_request(request, body.rev, if_match), label="접수")
    reason = (body.payment_cancel_reason or "").strip()
    if reason:
        app.payment_cancel_reason = reason
    app.payment_status = "refunded"
    bump_rev(app)
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="payment_cancel",
        target_type="applications",
        target_id=app_id,
        memo=reason or None,
    )
    await db.commit()
    return {"refunded": True, "rev": app.rev}


@router.post("/applications/{app_id}/photo-review")
async def photo_review(
    app_id: int,
    body: PhotoReviewBody,
    request: Request,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: AuthUser = Depends(matrix_perm("applicants", "photo")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise api_error("NOT_FOUND", "접수를 찾을 수 없습니다.", 404)
    check_rev(app, expected_rev_from_request(request, body.rev, if_match), label="접수")
    if body.action == "approve":
        app.photo_review_status = "approved"
        app.status = "payment_pending"
    elif body.action == "reject":
        app.photo_review_status = "rejected"
        app.photo_reject_code = body.photo_reject_code
        app.photo_reject_note = body.photo_reject_note
        app.status = "photo_review"
        user = (await db.execute(select(User).where(User.id == app.user_id))).scalar_one_or_none()
        if user:
            await notify_photo_rejected(
                db,
                app,
                user,
                photo_reject_code=body.photo_reject_code,
                photo_reject_note=body.photo_reject_note,
            )
    else:
        raise api_error("VALIDATION_ERROR", "action은 approve 또는 reject여야 합니다.")
    bump_rev(app)
    await write_audit(db, admin_user_id=admin.id, action_type=f"photo_review_{body.action}", target_type="applications", target_id=app_id)
    await db.commit()
    return {"photo_review_status": app.photo_review_status, "rev": app.rev}


def _assign_group_serials(apps_sorted: list[Application], accommodation_ids: set[int]) -> dict[int, int]:
    """(지역,시험장,수준) 묶음 내 응시자코드(4자리) 일련번호 배정.

    - 일반 신청자: 영문명 오름차순 1번부터.
    - 편의지원 신청자: 해당 수준의 '마지막 홀수' 번호부터 내림차순(9,7,5,…) 배정.
    반환: {application_id: serial(int)}
    """
    n = len(apps_sorted)
    accom = [a for a in apps_sorted if a.id in accommodation_ids]
    regular = [a for a in apps_sorted if a.id not in accommodation_ids]

    largest_odd = n if n % 2 == 1 else n - 1
    odd_seats = list(range(largest_odd, 0, -2)) if largest_odd >= 1 else []

    result: dict[int, int] = {}
    used: set[int] = set()
    for i, a in enumerate(accom):
        if i < len(odd_seats):
            seat = odd_seats[i]
            result[a.id] = seat
            used.add(seat)

    remaining = [s for s in range(1, n + 1) if s not in used]
    ri = 0
    for a in regular:
        result[a.id] = remaining[ri]
        ri += 1
    # 편의지원자가 홀수 좌석보다 많은 예외: 남은 좌석에서 채움
    for a in accom:
        if a.id not in result:
            result[a.id] = remaining[ri]
            ri += 1
    return result


@router.post("/exam-rounds/{round_id}/assign-exam-numbers")
async def assign_exam_numbers(
    round_id: int,
    body: AssignNumbersBody,
    admin: AuthUser = Depends(matrix_perm("applicants", "exam")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    # RBAC: 수험번호 부여는 최고관리자만(계약서 7절).
    _require_super(admin)

    rnd = (
        await db.execute(select(ExamRound).where(ExamRound.id == round_id).with_for_update())
    ).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    # 이미 부여·공개된 수험번호의 재배정 방지(최초 부여는 허용).
    if (
        not body.dry_run
        and rnd.exam_numbers_assigned_at
        and rnd.exam_number_visible_at
        and rnd.exam_number_visible_at <= datetime.now(timezone.utc)
    ):
        raise api_error("ALREADY_VISIBLE", "이미 공개된 수험번호는 재배정할 수 없습니다.", 409)

    # 대상: 수납 완료 + 사진 승인 + 비반려 + 수험번호 미부여
    result = await db.execute(
        select(Application, User)
        .join(User, User.id == Application.user_id)
        .where(
            Application.exam_round_id == round_id,
            Application.payment_status == "paid",
            Application.photo_review_status == "approved",
            Application.status.notin_(("cancelled", "rejected")),
            Application.exam_number.is_(None),
        )
    )
    rows = result.all()
    if not rows:
        return {"dry_run": body.dry_run, "assigned": 0, "preview": [], "groups": []}

    # 편의지원 신청 submission 집합.
    sub_res = await db.execute(
        select(ApplicationSubmission.id).where(
            ApplicationSubmission.exam_round_id == round_id,
            ApplicationSubmission.accommodation_requested.is_(True),
        )
    )
    accommodation_subs = {sid for (sid,) in sub_res.all()}

    venue_cache: dict[int, ExamVenue] = {}

    async def _venue(vid: int) -> ExamVenue | None:
        if vid not in venue_cache:
            v = (await db.execute(select(ExamVenue).where(ExamVenue.id == vid))).scalar_one_or_none()
            venue_cache[vid] = v
        return venue_cache[vid]

    # (venue_id, level) 그룹핑.
    groups: dict[tuple[int, str], list[tuple[Application, User]]] = {}
    for app, user in rows:
        groups.setdefault((app.exam_venue_id, app.exam_level), []).append((app, user))

    assigned = 0
    preview: list[str] = []
    group_summ: list[dict] = []
    for (venue_id, level), pairs in groups.items():
        venue = await _venue(venue_id)
        if not venue:
            continue
        # 영문명 오름차순(동명 시 id 안정 정렬).
        pairs.sort(key=lambda pu: ((pu[1].name_en or "").upper(), pu[0].id))
        apps_sorted = [app for app, _ in pairs]
        accommodation_ids = {a.id for a in apps_sorted if a.submission_id in accommodation_subs}
        serials = _assign_group_serials(apps_sorted, accommodation_ids)

        level_code = "7" if level == "I" else "8"
        country = (venue.country_code or "025").zfill(3)
        region = (venue.region_code or "001").zfill(3)
        venue_code = (venue.venue_code or "01").zfill(2)

        for app in apps_sorted:
            serial = serials[app.id]
            exam_number = f"{country}{region}{level_code}{venue_code}{serial:04d}"
            preview.append(exam_number)
            if not body.dry_run:
                app.exam_number = exam_number
                app.status = "exam_number_assigned"
                app.exam_number_visible = False
                assigned += 1
        group_summ.append(
            {
                "venue_id": venue_id,
                "venue_name": venue.name_ko,
                "region_code": region,
                "venue_code": venue_code,
                "level": level,
                "count": len(apps_sorted),
                "accommodation": len(accommodation_ids),
            }
        )

    preview.sort()
    if not body.dry_run:
        rnd.exam_numbers_assigned_at = datetime.now(timezone.utc)
        if body.visible_at:
            rnd.exam_number_visible_at = body.visible_at
        await write_audit(
            db,
            admin_user_id=admin.id,
            action_type="exam_number_assign",
            target_type="exam_rounds",
            target_id=round_id,
            after_data={"count": assigned, "groups": len(group_summ)},
            ip_address=ip,
        )
        await db.commit()
    return {
        "dry_run": body.dry_run,
        "assigned": assigned if not body.dry_run else len(preview),
        "preview": preview[:50],
        "groups": group_summ,
    }


@router.get("/exam-rounds")
async def admin_exam_rounds(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(ExamRound).options(selectinload(ExamRound.venue_links)).order_by(ExamRound.round_no.desc()))
    rounds = list(result.scalars().all())
    await sync_exam_rounds_status(db, rounds)
    return {"items": [serialize_round(r) for r in rounds]}


@router.post("/exam-rounds")
async def create_round(
    body: RoundBody,
    admin: AuthUser = Depends(matrix_perm("sessions", "create")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 회차 생성/수정 = 최고관리자(계약서 7절)
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
    await sync_exam_round_status(db, rnd)
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_round_create",
        target_type="exam_rounds", target_id=rnd.id,
        after_data={"round_no": body.round_no, "registration_status": rnd.registration_status},
        ip_address=ip,
    )
    await db.commit()
    return {"id": rnd.id}


@router.patch("/exam-rounds/{round_id}")
async def update_round(
    round_id: int,
    body: RoundPatchBody,
    admin: AuthUser = Depends(matrix_perm("sessions", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 회차 수정 = 최고관리자
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    if rnd.registration_status == "revoked":
        raise api_error("VALIDATION_ERROR", "폐지된 회차는 수정할 수 없습니다.", 400)
    before = {"title": rnd.title, "registration_status": rnd.registration_status}
    patch = body.model_dump(exclude_unset=True)
    for key in (
        "round_no",
        "title",
        "exam_date",
        "registration_start_at",
        "registration_end_at",
        "fee_level_i",
        "fee_level_ii",
        "capacity",
        "exam_number_visible_at",
    ):
        if key in patch:
            setattr(rnd, key, patch[key])
    if "venue_ids" in patch:
        await db.execute(delete(ExamRoundVenue).where(ExamRoundVenue.exam_round_id == round_id))
        for vid in patch["venue_ids"]:
            db.add(ExamRoundVenue(exam_round_id=round_id, exam_venue_id=vid))
    await sync_exam_round_status(db, rnd)
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_round_update",
        target_type="exam_rounds", target_id=round_id, before_data=before,
        after_data=jsonable_encoder({**patch, "registration_status": rnd.registration_status}), ip_address=ip,
    )
    await db.commit()
    return {"updated": True}


@router.post("/exam-rounds/{round_id}/status")
async def round_status(
    round_id: int,
    body: dict,
    admin: AuthUser = Depends(matrix_perm("sessions", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 회차 상태변경 = 최고관리자
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    status = body.get("registration_status")
    if status not in ("scheduled", "open", "closed"):
        raise api_error("VALIDATION_ERROR", "registration_status가 올바르지 않습니다.")
    before = rnd.registration_status
    rnd.registration_status = status
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_round_status",
        target_type="exam_rounds", target_id=round_id,
        before_data={"registration_status": before}, after_data={"registration_status": status}, ip_address=ip,
    )
    await db.commit()
    return {"registration_status": status}


@router.post("/exam-rounds/{round_id}/revoke")
async def revoke_round(
    round_id: int,
    admin: AuthUser = Depends(matrix_perm("sessions", "delete")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 회차 폐지 = 최고관리자
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    if rnd.registration_status == "revoked":
        raise api_error("VALIDATION_ERROR", "이미 폐지된 회차입니다.", 400)
    before = {"registration_status": rnd.registration_status}
    rnd.registration_status = "revoked"
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_round_revoke",
        target_type="exam_rounds", target_id=round_id,
        before_data=before, after_data={"registration_status": "revoked"}, ip_address=ip,
    )
    await db.commit()
    return {"revoked": True, "registration_status": "revoked"}


@router.post("/exam-rounds/{round_id}/restore")
async def restore_round(
    round_id: int,
    body: dict | None = None,
    admin: AuthUser = Depends(matrix_perm("sessions", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 회차 복구 = 최고관리자
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        raise api_error("NOT_FOUND", "회차를 찾을 수 없습니다.", 404)
    if rnd.registration_status != "revoked":
        raise api_error("VALIDATION_ERROR", "폐지된 회차만 복구할 수 있습니다.", 400)

    body = body or {}
    status = body.get("registration_status")
    if status:
        if status not in ("scheduled", "open", "closed"):
            raise api_error("VALIDATION_ERROR", "registration_status가 올바르지 않습니다.")
    else:
        audit_res = await db.execute(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.action_type == "exam_round_revoke",
                AdminAuditLog.target_type == "exam_rounds",
                AdminAuditLog.target_id == str(round_id),
            )
            .order_by(AdminAuditLog.created_at.desc())
            .limit(1)
        )
        log = audit_res.scalar_one_or_none()
        prev = (log.before_data or {}).get("registration_status") if log else None
        status = prev if prev in ("scheduled", "open", "closed") else "scheduled"

    before = {"registration_status": rnd.registration_status}
    rnd.registration_status = status
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_round_restore",
        target_type="exam_rounds", target_id=round_id,
        before_data=before, after_data={"registration_status": status}, ip_address=ip,
    )
    await db.commit()
    return {"restored": True, "registration_status": status}


@router.post("/translate")
async def admin_translate(
    body: TranslateBody,
    _: AuthUser = Depends(require_any_admin),
) -> dict:
    try:
        translated = await translate_text(body.text, source=body.source, target=body.target)
    except Exception as exc:
        raise api_error(
            "TRANSLATE_FAILED",
            "번역에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            502,
        ) from exc
    return {"text": translated, "source": body.source, "target": body.target}


@router.get("/exam-venues")
async def admin_venues(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(ExamVenue).order_by(ExamVenue.venue_code))
    return {"items": [serialize_venue(v) for v in result.scalars().all()]}


@router.patch("/exam-venues/{venue_id}")
async def update_venue(
    venue_id: int,
    body: dict,
    admin: AuthUser = Depends(matrix_perm("venues", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 시험장 수정 = 최고관리자
    venue = (await db.execute(select(ExamVenue).where(ExamVenue.id == venue_id))).scalar_one_or_none()
    if not venue:
        raise api_error("NOT_FOUND", "시험장을 찾을 수 없습니다.", 404)
    for key in ("venue_code", "name_ko", "name_en", "name_my", "address", "region_code", "capacity", "memo", "is_active"):
        if key in body:
            setattr(venue, key, body[key])
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_venue_update",
        target_type="exam_venues", target_id=venue_id, after_data=body, ip_address=ip,
    )
    await db.commit()
    return {"updated": True}


@router.post("/exam-venues")
async def create_venue(
    body: VenueBody,
    admin: AuthUser = Depends(matrix_perm("venues", "create")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 시험장 생성 = 최고관리자
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
        name_my=body.name_my,
        address=body.address,
        country_code=body.country_code,
        region_code=body.region_code,
        capacity=body.capacity,
        memo=body.memo,
    )
    db.add(venue)
    await db.flush()
    await write_audit(
        db, admin_user_id=admin.id, action_type="exam_venue_create",
        target_type="exam_venues", target_id=venue.id,
        after_data={"venue_code": body.venue_code, "region_code": body.region_code}, ip_address=ip,
    )
    await db.commit()
    return {"id": venue.id}


@router.get("/notices")
async def admin_notices(
    trash: bool = Query(False),
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    if trash:
        await _purge_expired_notice_trash(db)
        await db.commit()
    stmt = select(Notice).where(Notice.is_deleted.is_(trash)).order_by(
        Notice.deleted_at.desc().nullslast() if trash else Notice.id.desc()
    )
    result = await db.execute(stmt)
    notices = result.scalars().all()
    notice_ids = [n.id for n in notices]
    att_map: dict[int, list[dict]] = {nid: [] for nid in notice_ids}
    if notice_ids:
        att_res = await db.execute(
            select(FileAttachment).where(
                FileAttachment.owner_type == _NOTICE_ATTACH_OWNER,
                FileAttachment.owner_id.in_(notice_ids),
            )
        )
        for row in att_res.scalars().all():
            att_map.setdefault(row.owner_id, []).append(_notice_attachment_dict(row))
    return {
        "items": [_notice_row_dict(n, att_map.get(n.id, [])) for n in notices]
    }


@router.post("/notices")
async def create_notice(
    body: NoticeBody,
    admin: AuthUser = Depends(matrix_perm("notices", "create")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _validate_notice_display_window(body.display_start_at, body.display_end_at)
    notice = Notice(
        category=body.category,
        title=body.title,
        title_my=body.title_my,
        title_en=body.title_en,
        body_html=body.body_html,
        body_my=body.body_my,
        body_en=body.body_en,
        is_pinned=body.is_pinned,
        is_published=body.is_published,
        display_start_at=body.display_start_at,
        display_end_at=body.display_end_at,
        author_admin_id=admin.id,
        published_at=datetime.now(timezone.utc) if body.is_published else None,
    )
    db.add(notice)
    await db.flush()
    if body.attachment_file_ids:
        await _apply_notice_attachments(
            db,
            notice_id=notice.id,
            admin_id=admin.id,
            add_ids=body.attachment_file_ids,
            remove_ids=[],
        )
    await write_audit(
        db, admin_user_id=admin.id, action_type="notice_create",
        target_type="notices", target_id=notice.id,
        after_data={"title": body.title, "is_published": body.is_published}, ip_address=ip,
    )
    await db.commit()
    return {"id": notice.id}


@router.post("/notices/attachments")
async def upload_notice_attachment(
    file: UploadFile = File(...),
    admin: AuthUser = Depends(matrix_perm("notices", "edit")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    content_type = (file.content_type or "").lower()
    filename = file.filename or "file"
    if not _notice_attachment_allowed(content_type, filename):
        raise api_error(
            "INVALID_FILE_TYPE",
            "이미지(jpg, png, gif, webp 등) 또는 문서(pdf, doc, docx, xls, xlsx, ppt, pptx, hwp, txt, zip 등)만 업로드할 수 있습니다.",
        )
    data = await file.read()
    if len(data) > _NOTICE_ATTACH_MAX_BYTES:
        raise api_error("FILE_TOO_LARGE", "10MB 이하의 파일만 업로드할 수 있습니다.")
    if content_type not in _ALLOWED_NOTICE_ATTACH:
        content_type = _guess_notice_mime(filename)
    try:
        row = await save_upload(
            db,
            owner_type=_NOTICE_ATTACH_PENDING,
            owner_id=admin.id,
            data=data,
            mime_type=content_type,
            original_filename=filename,
            max_bytes=_NOTICE_ATTACH_MAX_BYTES,
        )
    except ValueError as exc:
        msg = "10MB 이하의 파일만 업로드할 수 있습니다." if str(exc) == "file_too_large" else "파일을 업로드할 수 없습니다."
        raise api_error("FILE_TOO_LARGE", msg) from exc
    await db.commit()
    return {
        "file_id": row.id,
        "filename": row.original_filename,
        "size": row.size_bytes,
        "content_type": row.mime_type,
    }


@router.post("/notices/{notice_id}/send-marketing")
async def send_marketing_notice(
    notice_id: int,
    admin: AuthUser = Depends(matrix_perm("notices", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """마케팅 수신 동의 회원에게 공지 알림 메일 일괄 enqueue (속도: 배치 상한)."""
    notice = (await db.execute(select(Notice).where(Notice.id == notice_id))).scalar_one_or_none()
    if not notice:
        raise api_error("NOT_FOUND", "공지를 찾을 수 없습니다.", 404)
    if not notice.is_published:
        raise api_error("VALIDATION_ERROR", "게시된 공지만 발송할 수 있습니다.", 400)

    base = settings.public_fo_base.rstrip("/")
    published = fmt_date(notice.published_at) if notice.published_at else fmt_date(notice.created_at)
    notice_url = f"{base}/notice.html"

    result = await db.execute(
        select(User)
        .where(User.status == "active", User.marketing_opt_in.is_(True))
        .order_by(User.id.asc())
        .limit(MARKETING_BATCH_LIMIT)
    )
    users = result.scalars().all()
    queued = 0
    for user in users:
        await notify_notice_marketing(
            db,
            user,
            notice_title=notice.title,
            notice_category=notice.category or "공지",
            published_at=published,
            notice_url=notice_url,
        )
        queued += 1

    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="notice_marketing_send",
        target_type="notices",
        target_id=notice_id,
        after_data={"queued": queued, "notice_title": notice.title},
        ip_address=ip,
    )
    await db.commit()
    return {"queued": queued, "notice_id": notice_id}


@router.patch("/notices/{notice_id}")
async def update_notice(
    notice_id: int,
    body: dict,
    admin: AuthUser = Depends(matrix_perm("notices", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    notice = (await db.execute(select(Notice).where(Notice.id == notice_id))).scalar_one_or_none()
    if not notice:
        raise api_error("NOT_FOUND", "공지를 찾을 수 없습니다.", 404)
    datetime_keys = {"display_start_at", "display_end_at"}
    for key in (
        "category", "title", "title_my", "title_en",
        "body_html", "body_my", "body_en",
        "is_pinned", "is_published",
        "display_start_at", "display_end_at",
    ):
        if key in body:
            val = _parse_optional_datetime(body[key]) if key in datetime_keys else body[key]
            setattr(notice, key, val)
    _validate_notice_display_window(notice.display_start_at, notice.display_end_at)
    if body.get("is_published") and not notice.published_at:
        notice.published_at = datetime.now(timezone.utc)
    add_ids = body.get("attachment_file_ids") or []
    remove_ids = body.get("remove_attachment_file_ids") or []
    if add_ids or remove_ids:
        await _apply_notice_attachments(
            db,
            notice_id=notice_id,
            admin_id=admin.id,
            add_ids=add_ids,
            remove_ids=remove_ids,
        )
    await write_audit(
        db, admin_user_id=admin.id, action_type="notice_update",
        target_type="notices", target_id=notice_id, after_data=body, ip_address=ip,
    )
    await db.commit()
    return {"updated": True}


@router.delete("/notices/{notice_id}")
async def delete_notice(
    notice_id: int,
    admin: AuthUser = Depends(matrix_perm("notices", "delete")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """공지 soft-delete — 휴지통 30일 보관."""
    notice = (await db.execute(select(Notice).where(Notice.id == notice_id, Notice.is_deleted.is_(False)))).scalar_one_or_none()
    if not notice:
        raise api_error("NOT_FOUND", "공지를 찾을 수 없습니다.", 404)
    notice.is_deleted = True
    notice.deleted_at = datetime.now(timezone.utc)
    notice.is_published = False
    await write_audit(
        db, admin_user_id=admin.id, action_type="notice_delete",
        target_type="notices", target_id=notice_id,
        before_data={"title": notice.title}, ip_address=ip,
    )
    await db.commit()
    return {"deleted": True, "id": notice_id}


@router.post("/notices/{notice_id}/restore")
async def restore_notice(
    notice_id: int,
    admin: AuthUser = Depends(matrix_perm("notices", "edit")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    notice = (await db.execute(select(Notice).where(Notice.id == notice_id, Notice.is_deleted.is_(True)))).scalar_one_or_none()
    if not notice:
        raise api_error("NOT_FOUND", "휴지통에 공지가 없습니다.", 404)
    notice.is_deleted = False
    notice.deleted_at = None
    await write_audit(
        db, admin_user_id=admin.id, action_type="notice_restore",
        target_type="notices", target_id=notice_id,
        after_data={"title": notice.title}, ip_address=ip,
    )
    await db.commit()
    return {"restored": True, "id": notice_id}


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
async def create_faq(
    body: FaqBody,
    admin: AuthUser = Depends(matrix_perm("faq", "create")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = FaqItem(**body.model_dump())
    db.add(row)
    await db.flush()
    await write_audit(
        db, admin_user_id=admin.id, action_type="faq_create",
        target_type="faq", target_id=row.id, after_data={"category": body.category}, ip_address=ip,
    )
    await db.commit()
    return {"id": row.id}


@router.patch("/faq/{faq_id}")
async def update_faq(
    faq_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (await db.execute(select(FaqItem).where(FaqItem.id == faq_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "FAQ를 찾을 수 없습니다.", 404)
    if body.get("is_active") is False:
        await assert_perm(db, admin, "faq", "delete")
    else:
        await assert_perm(db, admin, "faq", "edit")
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
    await write_audit(
        db, admin_user_id=admin.id, action_type="faq_update",
        target_type="faq", target_id=faq_id, after_data=body, ip_address=ip,
    )
    await db.commit()
    return {"updated": True}


@router.get("/terms")
async def admin_terms(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(Term).order_by(Term.term_type, Term.id.desc()))
    return {"items": [_term_dict(t) for t in result.scalars().all()]}


@router.get("/terms/consents")
async def terms_consents(
    term_type: str | None = Query(None),
    user_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    format: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=2000),
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """약관 동의 이력 조회(필터: 약관종류/기간/회원) + CSV(format=csv)."""
    stmt = select(TermConsent).order_by(TermConsent.created_at.desc(), TermConsent.id.desc())
    if term_type:
        stmt = stmt.where(TermConsent.term_type == term_type)
    if user_id:
        stmt = stmt.where(TermConsent.user_id == user_id)
    if date_from:
        stmt = stmt.where(TermConsent.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        end = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
        stmt = stmt.where(TermConsent.created_at <= end)

    total = 0
    if format != "csv":
        total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    uids = {r.user_id for r in rows if r.user_id}
    users: dict[int, User] = {}
    if uids:
        ures = await db.execute(select(User).where(User.id.in_(uids)))
        users = {u.id: u for u in ures.scalars().all()}

    def _item(r: TermConsent) -> dict:
        u = users.get(r.user_id) if r.user_id else None
        return {
            "id": r.id,
            "user_id": r.user_id,
            "user_email": u.email if u else None,
            "user_name": u.name_ko if u else None,
            "term_type": r.term_type,
            "version": r.version,
            "agreed": r.agreed,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "created_at_label": fmt_datetime(r.created_at),
        }

    if format == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["id", "user_id", "user_email", "user_name", "term_type", "version", "agreed", "ip_address", "created_at"])
        for r in rows:
            it = _item(r)
            writer.writerow([
                it["id"], it["user_id"], it["user_email"], it["user_name"],
                it["term_type"], it["version"], it["agreed"], it["ip_address"], it["created_at"],
            ])
        data = out.getvalue().encode("utf-8-sig")
        return StreamingResponse(
            io.BytesIO(data),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="terms_consents.csv"'},
        )

    return {"items": [_item(r) for r in rows], "page": page, "page_size": page_size, "total_items": total}


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
async def create_term(body: TermBody, admin: AuthUser = Depends(matrix_perm("terms", "create")), db: AsyncSession = Depends(get_db_session)) -> dict:
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
    admin: AuthUser = Depends(matrix_perm("terms", "create")),
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
async def retire_term(
    term_id: int,
    admin: AuthUser = Depends(matrix_perm("terms", "publish")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 약관 게시/폐지 = 최고관리자
    row = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    if row.status != "published":
        raise api_error("VALIDATION_ERROR", "게시 중인 약관만 폐지할 수 있습니다.", 400)
    row.status = "retired"
    await write_audit(db, admin_user_id=admin.id, action_type="term_retire", target_type="terms", target_id=term_id, ip_address=ip)
    await db.commit()
    return {"retired": True}


@router.post("/terms/{term_id}/publish")
async def publish_term(
    term_id: int,
    admin: AuthUser = Depends(matrix_perm("terms", "publish")),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)  # RBAC: 약관 게시 = 최고관리자
    row = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if not row:
        raise api_error("NOT_FOUND", "약관을 찾을 수 없습니다.", 404)
    await db.execute(update(Term).where(Term.term_type == row.term_type, Term.status == "published").values(status="retired"))
    row.status = "published"
    row.published_at = datetime.now(timezone.utc)
    await write_audit(db, admin_user_id=admin.id, action_type="term_publish", target_type="terms", target_id=term_id, ip_address=ip)
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
    admin: AuthUser = Depends(require_any_admin),
    ip: str | None = Depends(get_client_ip),
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
        .order_by(BoardComment.created_at, BoardComment.id)
    )
    raw_comments = comments_res.scalars().all()
    user_ids = {c.author_user_id for c in raw_comments if c.author_user_id}
    admin_ids = {c.author_admin_id for c in raw_comments if c.author_admin_id}
    users: dict[int, str] = {}
    admins: dict[int, str] = {}
    if user_ids:
        ures = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u.name_ko for u in ures.scalars().all()}
    if admin_ids:
        ares = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a.name for a in ares.scalars().all()}

    def author_for(c: BoardComment) -> str | None:
        if c.author_admin_id:
            return admins.get(c.author_admin_id) or "관리자"
        if c.author_user_id:
            return users.get(c.author_user_id)
        return None

    comments = build_comment_tree(raw_comments, author_for=author_for)
    att_res = await db.execute(
        select(FileAttachment).where(
            FileAttachment.owner_type == "board_post", FileAttachment.owner_id == post_id
        )
    )
    attachments = [
        {"file_id": f.id, "filename": f.original_filename or "file", "size": f.size_bytes, "url": f"/api/v1/files/{f.id}"}
        for f in att_res.scalars().all()
    ]
    data = _board_post_dict(post, user)
    data["admin_replies"] = await official_replies_for_post(db, post)
    data["has_admin_reply"] = bool(data["admin_replies"] or post.admin_reply)
    data["comments"] = comments
    data["attachments"] = attachments
    # 관리자가 비밀글 열람 시 audit 기록(계약서 6.2).
    if post.is_secret:
        await write_audit(
            db, admin_user_id=admin.id, action_type="board_secret_view",
            target_type="board_posts", target_id=post_id, ip_address=ip,
        )
        await db.commit()
    return {"post": data}


@router.get("/board/posts/{post_id}/comments")
async def admin_list_board_comments(
    post_id: int,
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = (await db.execute(select(BoardPost).where(BoardPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    comments_res = await db.execute(
        select(BoardComment)
        .where(BoardComment.board_post_id == post_id, BoardComment.is_deleted.is_(False))
        .order_by(BoardComment.created_at, BoardComment.id)
    )
    raw_comments = comments_res.scalars().all()
    user_ids = {c.author_user_id for c in raw_comments if c.author_user_id}
    admin_ids = {c.author_admin_id for c in raw_comments if c.author_admin_id}
    users: dict[int, str] = {}
    admins: dict[int, str] = {}
    if user_ids:
        ures = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u.name_ko for u in ures.scalars().all()}
    if admin_ids:
        ares = await db.execute(select(AdminUser).where(AdminUser.id.in_(admin_ids)))
        admins = {a.id: a.name for a in ares.scalars().all()}

    def author_for(c: BoardComment) -> str | None:
        if c.author_admin_id:
            return admins.get(c.author_admin_id) or "관리자"
        if c.author_user_id:
            return users.get(c.author_user_id)
        return None

    roots = build_comment_tree(raw_comments, author_for=author_for)
    return {"comments": roots, "items": roots}


@router.post("/board/posts/{post_id}/comments")
async def admin_create_board_comment(
    post_id: int,
    body: dict,
    admin: AuthUser = Depends(require_admin),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = (await db.execute(select(BoardPost).where(BoardPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    await assert_perm(db, admin, board_menu_for_type(post.board_type), "answer")
    content = (body.get("content") or body.get("body") or "").strip()
    if not content:
        raise api_error("VALIDATION_ERROR", "댓글 내용을 입력해 주세요.")
    parent_raw = body.get("parent_id") if body.get("parent_id") is not None else body.get("parent_comment_id")
    parent_id = parse_parent_comment_id(parent_raw)
    if parent_raw is not None and parent_raw != "" and parent_id is None:
        raise api_error("VALIDATION_ERROR", "parent_comment_id가 올바르지 않습니다.", 400)
    is_public_raw = body.get("is_public")
    is_public = None if is_public_raw is None else bool(is_public_raw)
    comment = BoardComment(
        board_post_id=post_id,
        author_admin_id=admin.id,
        body=content,
        parent_comment_id=parent_id,
        is_secret=resolve_comment_is_secret(post, is_public),
    )
    db.add(comment)
    user = (await db.execute(select(User).where(User.id == post.user_id))).scalar_one_or_none()
    if user:
        await notify_board_reply(
            db, post, user, activity_type="댓글" if not parent_id else "대댓글"
        )
    await write_audit(
        db, admin_user_id=admin.id, action_type="board_comment",
        target_type="board_posts", target_id=post_id, ip_address=ip,
    )
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "created_at": comment.created_at.isoformat()}


@router.delete("/board/posts/{post_id}")
async def delete_board_post(
    post_id: int,
    admin: AuthUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    post = (await db.execute(select(BoardPost).where(BoardPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise api_error("NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    await assert_perm(db, admin, board_menu_for_type(post.board_type), "delete")
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
    await assert_perm(db, admin, board_menu_for_type(post.board_type), "answer")
    allowed = (
        {"received", "in_review", "completed", "rejected"}
        if post.board_type == "refund_correction"
        else {"awaiting_reply", "answered"}
    )
    if body.workflow_status not in allowed:
        raise api_error("VALIDATION_ERROR", "workflow_status가 올바르지 않습니다.", 400)
    before = post.workflow_status
    post.workflow_status = body.workflow_status
    user = (await db.execute(select(User).where(User.id == post.user_id))).scalar_one_or_none()
    if user and before != post.workflow_status:
        await notify_board_workflow_changed(db, post, user, workflow_status=post.workflow_status)
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
    await assert_perm(db, admin, board_menu_for_type(post.board_type), "answer")
    post.admin_reply = body.body.strip()
    post.admin_replied_at = datetime.now(timezone.utc)
    post.admin_replier_id = admin.id
    db.add(BoardComment(
        board_post_id=post_id,
        author_admin_id=admin.id,
        body=body.body.strip(),
        is_official_reply=True,
        is_secret=post.is_secret,
    ))
    if body.mark_complete:
        post.workflow_status = "answered" if post.board_type == "inquiry" else "completed"
    user = (await db.execute(select(User).where(User.id == post.user_id))).scalar_one_or_none()
    if user:
        await notify_board_reply(db, post, user, activity_type="공식 답변")
    await write_audit(db, admin_user_id=admin.id, action_type="board_reply", target_type="board_posts", target_id=post_id)
    await db.commit()
    return {"replied": True}


@router.get("/users")
async def admin_users(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(User).order_by(User.id.desc()).limit(500))
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
                "signup_provider": u.signup_provider or "email",
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "rev": u.rev,
            }
            for u in result.scalars().all()
            if is_full_member(u)
        ]
    }


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UserPatchBody,
    request: Request,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: AuthUser = Depends(require_admin),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "회원을 찾을 수 없습니다.", 404)
    check_rev(user, expected_rev_from_request(request, body.rev, if_match), label="회원")
    before = {"status": user.status, "email": user.email}
    data = body.model_dump(exclude_unset=True)
    data.pop("rev", None)
    memo = (data.pop("memo", None) or "").strip() or None
    if data.get("status") not in ("suspended", "withdrawn") and data:
        await assert_perm(db, admin, "members", "edit")
    if "email" in data:
        requested = (data.pop("email") or "").strip().lower()
        if requested and requested != (user.email or "").strip().lower():
            raise api_error(
                "EMAIL_NOT_EDITABLE",
                "이메일(로그인 ID)은 변경할 수 없습니다.",
                400,
            )
    field_labels = {
        "name_ko": "한글성명",
        "name_en": "영문성명",
        "phone": "연락처",
        "nationality": "국적",
        "marketing_opt_in": "마케팅수신",
        "status": "상태",
    }

    def _format_diff_value(key: str, val) -> str:
        if key == "marketing_opt_in":
            if val is True:
                return "동의"
            if val is False:
                return "미동의"
        return str(val)
    changed_fields: list[str] = []
    diff_lines: list[str] = []
    if "status" in data and data["status"] not in ("active", "suspended", "withdrawn"):
        raise api_error("VALIDATION_ERROR", "status가 올바르지 않습니다.", 400)
    # RBAC: 회원 정지/탈퇴는 최고관리자(계약서 7절).
    if data.get("status") in ("suspended", "withdrawn"):
        _require_super(admin)
    for key, val in data.items():
        old = getattr(user, key, None)
        if old != val:
            label = field_labels.get(key, key)
            changed_fields.append(label)
            diff_lines.append(f"{label}: {_format_diff_value(key, old)} → {_format_diff_value(key, val)}")
        setattr(user, key, val)
    canceled_count = 0
    if data.get("status") == "withdrawn":
        now = datetime.now(timezone.utc)
        canceled_count = await count_active_applications(db, user_id)
        user.withdrawn_at = now
        # 탈퇴 시 진행중(미취소) 접수 자동 취소 cascade.
        await db.execute(
            update(ApplicationSubmission)
            .where(ApplicationSubmission.user_id == user_id, ApplicationSubmission.cancelled_at.is_(None))
            .values(cancelled_at=now, cancel_reason="관리자 회원 탈퇴", status="cancelled")
        )
        await db.execute(
            update(Application)
            .where(Application.user_id == user_id, Application.cancelled_at.is_(None))
            .values(cancelled_at=now, cancel_reason="관리자 회원 탈퇴", status="cancelled")
        )
    bump_rev(user)
    admin_row = (await db.execute(select(AdminUser).where(AdminUser.id == admin.id))).scalar_one_or_none()
    changed_by = f"{admin_row.name}({admin_row.email})" if admin_row else str(admin.id)
    if changed_fields and data.get("status") not in ("suspended", "withdrawn"):
        await notify_member_info_changed(
            db, user, changed_fields=changed_fields, diff_lines=diff_lines, changed_by=changed_by
        )
    if data.get("status") == "suspended":
        await notify_account_status(db, user, action="suspended")
    elif data.get("status") == "withdrawn":
        await notify_account_status(
            db,
            user,
            action="withdrawn",
            canceled_applications=canceled_count,
        )
    audit_memo = memo
    if data.get("status") == "withdrawn" and canceled_count > 0:
        suffix = f"진행 중 접수 {canceled_count}건 자동 취소"
        audit_memo = f"{memo} · {suffix}" if memo else suffix
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="user_update",
        target_type="users",
        target_id=user_id,
        before_data=before,
        after_data=data,
        memo=audit_memo,
        ip_address=ip,
    )
    await db.commit()
    return {"updated": True, "rev": user.rev}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    admin: AuthUser = Depends(matrix_perm("members", "reset")),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "회원을 찾을 수 없습니다.", 404)
    if user.signup_provider != "email" or not user.password_hash:
        raise api_error(
            "VALIDATION_ERROR",
            "Google 간편가입 회원은 비밀번호 초기화를 사용할 수 없습니다.",
            400,
        )
    alphabet = string.ascii_letters + string.digits
    temp = "tpkm" + "".join(secrets.choice(alphabet) for _ in range(8))
    user.password_hash = hash_password(temp)
    user.password_changed_at = None
    outbox_id = await notify_temp_password(db, user, temp)
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
    password = body.password.strip()
    if not is_valid_password(password):
        raise api_error(
            "VALIDATION_ERROR",
            "초기 비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 모두 포함해야 합니다.",
            400,
        )
    exists = await db.execute(select(AdminUser).where(AdminUser.email == email))
    if exists.scalar_one_or_none():
        raise api_error("DUPLICATE", "이미 사용 중인 이메일입니다.", 409)
    row = AdminUser(
        email=email,
        password_hash=hash_password(password),
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
    outbox_id = await notify_temp_password(db, row, temp, is_admin=True, admin_username=row.email)
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


@router.get("/permissions/matrix")
async def get_permissions_matrix(
    _: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    matrix = await load_matrix(db)
    row = await get_matrix_row(db)
    return {
        "matrix": matrix,
        "schema": perm_schema(),
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
        "updated_by_admin_id": row.updated_by_admin_id if row else None,
    }


@router.put("/permissions/matrix")
async def put_permissions_matrix(
    body: PermissionMatrixPutBody,
    admin: AuthUser = Depends(require_admin),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_super(admin)
    before_row = await get_matrix_row(db)
    before = before_row.matrix if before_row else await load_matrix(db)
    row = await save_matrix(db, matrix=body.matrix, admin_user_id=admin.id)
    await write_audit(
        db,
        admin_user_id=admin.id,
        action_type="permission_matrix_update",
        target_type="admin_permission_matrix",
        target_id="1",
        before_data={"matrix": before},
        after_data={"matrix": row.matrix},
        ip_address=ip,
    )
    await db.commit()
    return {
        "updated": True,
        "matrix": row.matrix,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/audit-logs")
async def audit_logs(
    target_type: str | None = Query(None),
    target_id: str | None = Query(None),
    admin: AuthUser = Depends(require_any_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    matrix = await load_matrix(db)
    if admin.role != "super":
        can_all = role_has(matrix, admin.role, "audit", "viewAll")
        can_own = role_has(matrix, admin.role, "audit", "viewOwn")
        if not can_all and not can_own:
            raise api_error("FORBIDDEN", "처리 이력 조회 권한이 없습니다.", 403)
    stmt = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())
    if target_type:
        stmt = stmt.where(AdminAuditLog.target_type == target_type)
    if target_id is not None:
        stmt = stmt.where(AdminAuditLog.target_id == str(target_id))
    limit = 100 if (target_type or target_id is not None) else 200
    result = await db.execute(stmt.limit(limit))
    logs = result.scalars().all()
    if admin.role != "super" and not role_has(matrix, admin.role, "audit", "viewAll"):
        logs = [l for l in logs if l.admin_user_id == admin.id]
    return {"items": await _serialize_audit_logs(db, logs)}


class AdminChangePasswordBody(BaseModel):
    current_password: str
    new_password: str
    new_password_confirm: str


@router.post("/me/change-password")
async def admin_change_password(
    body: AdminChangePasswordBody,
    admin: AuthUser = Depends(require_admin_base),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """관리자 본인 비밀번호 변경(첫 로그인 must_change_password 해제 포함)."""
    row = (await db.execute(select(AdminUser).where(AdminUser.id == admin.id))).scalar_one_or_none()
    current_password = body.current_password.strip()
    new_password = body.new_password.strip()
    new_password_confirm = body.new_password_confirm.strip()
    if not row or not verify_password(current_password, row.password_hash):
        raise api_error("INVALID_CREDENTIALS", "현재 비밀번호가 올바르지 않습니다.", 400)
    if not is_valid_password(new_password) or new_password != new_password_confirm:
        raise api_error("VALIDATION_ERROR", "새 비밀번호 규칙을 확인해 주세요.")
    if verify_password(new_password, row.password_hash):
        raise api_error("VALIDATION_ERROR", "새 비밀번호는 현재 비밀번호와 달라야 합니다.", 400)
    row.password_hash = hash_password(new_password)
    row.password_changed_at = datetime.now(timezone.utc)
    row.must_change_password = False
    await write_audit(
        db, admin_user_id=admin.id, action_type="admin_change_password",
        target_type="admin_users", target_id=admin.id, ip_address=ip,
    )
    await db.commit()
    return {"changed": True}


@router.get("/region-codes")
async def region_codes(_: AuthUser = Depends(require_any_admin), db: AsyncSession = Depends(get_db_session)) -> dict:
    result = await db.execute(select(CountryRegionCode).order_by(CountryRegionCode.country_code, CountryRegionCode.region_code))
    return {
        "items": [
            {"country_code": r.country_code, "region_code": r.region_code, "name_ko": r.name_ko, "name_en": r.name_en}
            for r in result.scalars().all()
        ]
    }
