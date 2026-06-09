"""Domain email enqueue helpers — 14 transactional templates."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.lib.formatting import board_status_label, fmt_date
from app.lib.mail import cancel_pending_outbox, enqueue_email
from app.models.admin import AdminUser
from app.models.application import Application
from app.models.board import BoardPost
from app.models.exam import ExamRound, ExamVenue
from app.models.user import User

BOARD_NAMES = {
    "refund_correction": "환불·정보정정신청",
    "refund": "환불·정보정정신청",
    "inquiry": "1:1 문의",
}


def _fo_base(settings: Settings | None = None) -> str:
    return (settings or get_settings()).public_fo_base.rstrip("/")


def _bo_base(settings: Settings | None = None) -> str:
    return (settings or get_settings()).public_bo_base.rstrip("/")


def _board_name(board_type: str) -> str:
    return BOARD_NAMES.get(board_type, board_type)


def _board_post_url(base: str, board_type: str, post_id: int) -> str:
    page = "refund-correction.html" if board_type in ("refund", "refund_correction") else "qna.html"
    return f"{base}/{page}?post={post_id}"


def _board_bo_post_url(bo_base: str, post_id: int) -> str:
    return f"{bo_base}/admin.html#board/{post_id}"


def _level_label(level: str) -> str:
    return "TOPIK Ⅱ" if str(level).upper() == "II" else "TOPIK Ⅰ"


def _common_site_vars(cfg: Settings | None = None) -> dict[str, str]:
    base = _fo_base(cfg)
    host = base.replace("https://", "").replace("http://", "")
    return {
        "siteUrl": host,
        "siteUrlFull": base,
        "supportEmail": "support@topik-myanmar.com",
    }


async def notify_application_approved(
    db: AsyncSession, app: Application, user: User, rnd: ExamRound, venue: ExamVenue | None
) -> None:
    base = _fo_base()
    await enqueue_email(
        db,
        template_key="application_approved",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "roundName": rnd.title,
            "level": _level_label(app.exam_level),
            "examDate": fmt_date(rnd.exam_date),
            "venueName": venue.name_ko if venue else "—",
            "myPageUrl": f"{base}/mypage.html",
        },
    )


async def notify_application_rejected(
    db: AsyncSession,
    app: Application,
    user: User,
    rnd: ExamRound,
    *,
    reject_reason: str | None,
    reject_code: str = "반려",
) -> None:
    base = _fo_base()
    await enqueue_email(
        db,
        template_key="application_rejected",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "applicantNo": app.application_no or str(app.id),
            "roundName": rnd.title,
            "rejectReason": reject_reason or "사유 미기재",
            "rejectCode": reject_code,
            "myPageUrl": f"{base}/mypage.html",
            "refundUrl": f"{base}/refund-correction.html",
        },
    )


async def notify_photo_rejected(
    db: AsyncSession,
    app: Application,
    user: User,
    *,
    photo_reject_code: str | None,
    photo_reject_note: str | None,
) -> None:
    base = _fo_base()
    await enqueue_email(
        db,
        template_key="photo_rejected",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "photoRejectCode": photo_reject_code or "심사 반려",
            "photoRejectReason": photo_reject_note or "증명사진 기준에 맞지 않습니다.",
            "editProfileUrl": f"{base}/mypage-profile.html",
        },
    )


async def notify_board_post_created(
    db: AsyncSession, post: BoardPost, user: User, *, admin_email: str | None = None
) -> None:
    cfg = get_settings()
    base = _fo_base(cfg)
    bo_base = _bo_base(cfg)
    board_name = _board_name(post.board_type)
    submitted = fmt_date(post.created_at) if post.created_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    post_url = _board_post_url(base, post.board_type, post.id)
    await enqueue_email(
        db,
        template_key="board_refund_received",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "boardName": board_name,
            "postTitle": post.title,
            "postId": str(post.id),
            "submittedAt": submitted,
            "postUrl": post_url,
        },
    )
    notify_to = (admin_email or cfg.admin_notify_email or "").strip().lower()
    if notify_to:
        await enqueue_email(
            db,
            template_key="board_admin_new_post",
            to_email=notify_to,
            locale="ko",
            variables={
                "userName": user.name_ko,
                "boardName": board_name,
                "category": post.category or post.post_type or "—",
                "postTitle": post.title,
                "submittedAt": submitted,
                "secretFlag": "예" if post.is_secret else "아니오",
                "boPostUrl": _board_bo_post_url(bo_base, post.id),
            },
        )


async def notify_board_reply(
    db: AsyncSession,
    post: BoardPost,
    user: User,
    *,
    activity_type: str = "공식 답변",
) -> None:
    await _enqueue_board_activity(
        db,
        post,
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        user_name=user.name_ko,
        activity_type=activity_type,
    )


async def notify_board_activity_to_operator(
    db: AsyncSession,
    post: BoardPost,
    *,
    activity_type: str,
    actor_name: str,
) -> None:
    """회원 댓글 등 — 운영자(admin@topik-myanmar.com) 알림."""
    admin_email = await resolve_admin_notify_email(db)
    await _enqueue_board_activity(
        db,
        post,
        to_email=admin_email,
        locale="ko",
        user_id=None,
        user_name=actor_name,
        activity_type=activity_type,
        salutation_name="운영자",
    )


async def _enqueue_board_activity(
    db: AsyncSession,
    post: BoardPost,
    *,
    to_email: str,
    locale: str,
    user_id: int | None,
    user_name: str,
    activity_type: str,
    salutation_name: str | None = None,
) -> None:
    base = _fo_base()
    board_name = _board_name(post.board_type)
    post_url = _board_post_url(base, post.board_type, post.id)
    await enqueue_email(
        db,
        template_key="board_reply",
        to_email=to_email,
        locale=locale,
        user_id=user_id,
        variables={
            "userName": salutation_name or user_name,
            "boardName": board_name,
            "postTitle": post.title,
            "activityType": activity_type,
            "postUrl": post_url,
        },
    )


async def notify_board_workflow_changed(
    db: AsyncSession,
    post: BoardPost,
    user: User,
    *,
    workflow_status: str,
) -> None:
    label = board_status_label(workflow_status) or workflow_status
    await notify_board_reply(db, post, user, activity_type=f"처리 상태 — {label}")


async def notify_notice_marketing(
    db: AsyncSession,
    user: User,
    *,
    notice_title: str,
    notice_category: str,
    published_at: str,
    notice_url: str,
) -> None:
    await enqueue_email(
        db,
        template_key="notice_marketing",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "noticeTitle": notice_title,
            "noticeCategory": notice_category,
            "publishedAt": published_at,
            "noticeUrl": notice_url,
        },
    )


async def notify_temp_password(
    db: AsyncSession, user: User, temp_password: str, *, is_admin: bool = False, admin_username: str | None = None
) -> int | None:
    cfg = get_settings()
    base = _fo_base(cfg)
    bo_base = _bo_base(cfg)
    if is_admin:
        to_email = user.email if hasattr(user, "email") else str(user)
        template_key = "temp_password_admin"
        await cancel_pending_outbox(db, to_email=to_email, template_key=template_key)
        result = await enqueue_email(
            db,
            template_key=template_key,
            to_email=to_email,
            locale="ko",
            variables={
                "adminUsername": admin_username or getattr(user, "email", ""),
                "temporaryPassword": temp_password,
                "boLoginUrl": f"{bo_base}/admin-login.html",
            },
        )
        return result.get("queued_id")
    await cancel_pending_outbox(db, to_email=user.email, template_key="temp_password")
    result = await enqueue_email(
        db,
        template_key="temp_password",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "temporaryPassword": temp_password,
            "loginUrl": f"{base}/login.html",
        },
    )
    return result.get("queued_id")


async def notify_account_status(
    db: AsyncSession,
    user: User,
    *,
    action: str,
    status_reason: str = "",
    status_until: str | None = None,
    canceled_applications: int = 0,
) -> None:
    cfg = get_settings()
    base = _fo_base(cfg)
    label = "정지" if action == "suspended" else "탈퇴"
    until = status_until or ("관리자 해제 시까지" if action == "suspended" else "—")
    await enqueue_email(
        db,
        template_key="account_status",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            **_common_site_vars(cfg),
            "userName": user.name_ko,
            "accountAction": action,
            "accountStatusLabel": label,
            "statusReason": status_reason or ("회원 탈퇴 요청" if action == "withdrawn" else "운영 정책에 따른 처리"),
            "statusUntil": until,
            "canceledApplications": str(canceled_applications),
            "supportBoardUrl": f"{base}/qna.html",
        },
    )


async def count_active_applications(db: AsyncSession, user_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Application)
        .where(Application.user_id == user_id, Application.cancelled_at.is_(None))
    )
    return int(result.scalar() or 0)


async def notify_member_info_changed(
    db: AsyncSession,
    user: User,
    *,
    changed_fields: list[str],
    diff_lines: list[str],
    changed_by: str,
) -> None:
    if not changed_fields:
        return
    cfg = get_settings()
    base = _fo_base(cfg)
    await enqueue_email(
        db,
        template_key="member_info_changed",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            **_common_site_vars(cfg),
            "userName": user.name_ko,
            "changedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
            "changedBy": changed_by,
            "changedFieldsSummary": " · ".join(changed_fields),
            "changeDiffHtml": "\n".join(diff_lines),
            "myPageUrl": f"{base}/mypage-profile.html",
            "supportBoardUrl": f"{base}/qna.html",
        },
    )


async def notify_password_expiry_reminder(db: AsyncSession, user: User, *, days_since: int) -> None:
    if user.signup_provider != "email" or not user.password_hash:
        return
    cfg = get_settings()
    base = _fo_base(cfg)
    last = user.password_changed_at.strftime("%Y.%m.%d") if user.password_changed_at else "—"
    await enqueue_email(
        db,
        template_key="password_expiry_reminder",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            **_common_site_vars(cfg),
            "userName": user.name_ko,
            "lastPasswordChange": last,
            "daysSincePwChange": str(days_since),
            "passwordChangeUrl": f"{base}/mypage-profile.html#password",
            "loginUrl": f"{base}/login.html",
        },
    )


async def resolve_admin_notify_email(db: AsyncSession) -> str:
    """운영자 알림 수신 — ADMIN_NOTIFY_EMAIL 우선, 없으면 super 관리자, 기본 admin@topik-myanmar.com."""
    cfg = get_settings()
    configured = (cfg.admin_notify_email or "").strip().lower()
    if configured:
        return configured
    res = await db.execute(
        select(AdminUser.email).where(AdminUser.status == "active", AdminUser.role == "super").limit(1)
    )
    row = res.scalar_one_or_none()
    if row:
        return row.strip().lower()
    return "admin@topik-myanmar.com"
