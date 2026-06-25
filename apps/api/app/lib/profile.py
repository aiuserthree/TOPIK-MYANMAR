from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.validation import validate_roster_codes
from app.models.application import Application
from app.models.user import User

PROFILE_INCOMPLETE_BIRTH = "00000000"
SIGNUP_PENDING_STATUS = "pending"
AUTH_USER_STATUSES: tuple[str, ...] = ("active", SIGNUP_PENDING_STATUS)
WITHDRAW_REREGISTRATION_DAYS = 30


def is_profile_incomplete(user: User) -> bool:
    if not user.photo_file_id:
        return True
    if user.birth_date == PROFILE_INCOMPLETE_BIRTH:
        return True
    if not (user.phone or "").strip():
        return True
    if validate_roster_codes(user.job_code, user.motive_code, user.purpose_code):
        return True
    return False


def is_full_member(user: User) -> bool:
    """가입 3단계 완료·정식 회원만 해당 (BO 회원목록·중복가입 검사)."""
    return user.status == "active" and not is_profile_incomplete(user)


PROFILE_BASIC_EDIT_LOCK_FIELDS: frozenset[str] = frozenset(
    {
        "name_ko",
        "name_en",
        "birth_date",
        "gender",
        "nationality",
        "first_language",
        "phone",
        "job_code",
        "motive_code",
        "purpose_code",
        "marketing_opt_in",
        "photo_base64",
    }
)


async def user_profile_basic_edit_locked(db: AsyncSession, user_id: int) -> bool:
    """다중접수(TOPIK Ⅰ·Ⅱ) 중 하나라도 승인완료이면 기본정보·사진 수정 불가."""
    result = await db.execute(
        select(Application.id).where(
            Application.user_id == user_id,
            Application.cancelled_at.is_(None),
            Application.status.notin_(("cancelled", "rejected")),
            or_(
                Application.status == "exam_number_assigned",
                and_(Application.status == "approved", Application.approved_at.isnot(None)),
            ),
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def remove_incomplete_signup_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.flush()


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def withdrawn_rejoin_days_remaining(user: User) -> int | None:
    """탈퇴 후 재가입 제한 잔여 일수. 제한 없으면 None."""
    if user.status != "withdrawn":
        return None
    withdrawn_at = user.withdrawn_at or user.updated_at or user.created_at
    if not withdrawn_at:
        return WITHDRAW_REREGISTRATION_DAYS
    elapsed_days = (datetime.now(timezone.utc) - _as_utc(withdrawn_at)).days
    remaining = WITHDRAW_REREGISTRATION_DAYS - elapsed_days
    if remaining <= 0:
        return None
    return remaining


async def remove_withdrawn_user_for_reregister(db: AsyncSession, user: User) -> None:
    if user.status != "withdrawn":
        return
    await db.delete(user)
    await db.flush()
