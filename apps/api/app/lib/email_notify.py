"""Domain email enqueue helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.lib.formatting import fmt_date
from app.lib.mail import cancel_pending_outbox, enqueue_email
from app.models.admin import AdminUser
from app.models.application import Application
from app.models.board import BoardPost
from app.models.exam import ExamRound, ExamVenue
from app.models.user import User

BOARD_NAMES = {
    "refund": "환불·정보정정신청",
    "inquiry": "1:1 문의",
}


def _fo_base(settings: Settings | None = None) -> str:
    return (settings or get_settings()).public_fo_base.rstrip("/")


def _level_label(level: str) -> str:
    return "TOPIK Ⅱ" if str(level).upper() == "II" else "TOPIK Ⅰ"


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
            "noticeUrl": f"{base}/notice.html",
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
    base = _fo_base()
    board_name = BOARD_NAMES.get(post.board_type, post.board_type)
    submitted = fmt_date(post.created_at) if post.created_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    post_url = f"{base}/refund-correction.html" if post.board_type == "refund" else f"{base}/qna.html"
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
    if admin_email:
        await enqueue_email(
            db,
            template_key="board_admin_new_post",
            to_email=admin_email,
            locale="ko",
            variables={
                "userName": user.name_ko,
                "boardName": board_name,
                "category": post.category or "—",
                "postTitle": post.title,
                "submittedAt": submitted,
                "secretFlag": "예" if post.is_secret else "아니오",
                "boPostUrl": f"{base.replace('www.', 'admin.')}/admin.html",
            },
        )


async def notify_board_reply(db: AsyncSession, post: BoardPost, user: User, *, activity_type: str = "공식 답변") -> None:
    base = _fo_base()
    board_name = BOARD_NAMES.get(post.board_type, post.board_type)
    post_url = f"{base}/refund-correction.html" if post.board_type == "refund" else f"{base}/qna.html"
    await enqueue_email(
        db,
        template_key="board_reply",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "boardName": board_name,
            "postTitle": post.title,
            "activityType": activity_type,
            "postUrl": post_url,
        },
    )


async def notify_temp_password(
    db: AsyncSession, user: User, temp_password: str, *, is_admin: bool = False, admin_username: str | None = None
) -> int | None:
    base = _fo_base()
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
                "boLoginUrl": f"{base.replace('www.', 'admin.')}/admin-login.html",
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
) -> None:
    base = _fo_base()
    label = "정지" if action == "suspended" else "탈퇴"
    await enqueue_email(
        db,
        template_key="account_status",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "accountAction": action,
            "accountStatusLabel": label,
            "statusReason": status_reason or "운영 정책에 따른 처리",
            "supportBoardUrl": f"{base}/qna.html",
        },
    )


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
    base = _fo_base()
    await enqueue_email(
        db,
        template_key="member_info_changed",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
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
    base = _fo_base()
    last = user.password_changed_at.strftime("%Y.%m.%d") if user.password_changed_at else "—"
    await enqueue_email(
        db,
        template_key="password_expiry_reminder",
        to_email=user.email,
        locale=user.preferred_lang,
        user_id=user.id,
        variables={
            "userName": user.name_ko,
            "lastPasswordChange": last,
            "daysSincePwChange": str(days_since),
            "passwordChangeUrl": f"{base}/mypage-profile.html#password",
            "loginUrl": f"{base}/login.html",
        },
    )


async def resolve_admin_notify_email(db: AsyncSession) -> str | None:
    res = await db.execute(
        select(AdminUser.email).where(AdminUser.status == "active", AdminUser.role == "super").limit(1)
    )
    row = res.scalar_one_or_none()
    return row
