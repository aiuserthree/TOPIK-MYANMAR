from __future__ import annotations

import re
from datetime import date

from app.config import get_settings

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
settings = get_settings()


def is_valid_email(email: str) -> bool:
    return bool(email and EMAIL_RE.match(email))


def is_valid_password(password: str) -> bool:
    if len(password) < 8:
        return False
    has_alpha = bool(re.search(r"[A-Za-z]", password))
    has_digit = bool(re.search(r"\d", password))
    has_special = bool(re.search(r"[^A-Za-z0-9]", password))
    return has_alpha and has_digit and has_special


def normalize_birth_date(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) != 8:
        return None
    y, m, d = int(digits[:4]), int(digits[4:6]), int(digits[6:8])
    if y < 1900 or m < 1 or m > 12 or d < 1 or d > 31:
        return None
    return digits


def is_under_minimum_age(birth_yyyymmdd: str, as_of: date | None = None) -> bool:
    as_of = as_of or date.today()
    if not birth_yyyymmdd or len(birth_yyyymmdd) != 8:
        return False
    y = int(birth_yyyymmdd[:4])
    m = int(birth_yyyymmdd[4:6])
    d = int(birth_yyyymmdd[6:8])
    age = as_of.year - y - ((as_of.month, as_of.day) < (m, d))
    return age < settings.min_signup_age_years


def gender_to_code(value: str) -> str:
    v = (value or "").strip().lower()
    if v in ("1", "m", "male", "남", "남성"):
        return "1"
    if v in ("2", "f", "female", "여", "여성"):
        return "2"
    return value[:1] if value else "1"


# 연명부 코드(권위 기준: 「연명부 양식.xlsx」 / 계약서 3절)
JOB_CODES = {1, 2, 3, 4, 5, 6, 7, 8}
MOTIVE_CODES = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}
PURPOSE_CODES = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15}


def validate_roster_codes(
    job_code: int | None,
    motive_code: int | None,
    purpose_code: int | None,
    lang: str | None = None,
) -> str | None:
    """직업/동기/목적 코드가 연명부 권위 코드표에 부합하는지 검증. 위반 시 메시지, 정상 시 None."""
    from app.lib.fo_messages import fo_message

    if not job_code or not motive_code or not purpose_code:
        return fo_message("roster_codes", lang)
    if job_code not in JOB_CODES:
        return fo_message("job_code_invalid", lang)
    if motive_code not in MOTIVE_CODES:
        return fo_message("motive_code_invalid", lang)
    if purpose_code not in PURPOSE_CODES:
        return fo_message("purpose_code_invalid", lang)
    return None
