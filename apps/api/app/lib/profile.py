from __future__ import annotations

from app.lib.validation import validate_roster_codes
from app.models.user import User

PROFILE_INCOMPLETE_BIRTH = "00000000"


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
