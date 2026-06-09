from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.validation import validate_roster_codes
from app.models.user import User

PROFILE_INCOMPLETE_BIRTH = "00000000"
SIGNUP_PENDING_STATUS = "pending"
AUTH_USER_STATUSES: tuple[str, ...] = ("active", SIGNUP_PENDING_STATUS)


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


async def remove_incomplete_signup_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.flush()
