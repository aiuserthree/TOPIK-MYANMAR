from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, Request

from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db_session
from app.lib.deps import AuthUser, get_client_ip, require_complete_user, require_user
from app.lib.profile import AUTH_USER_STATUSES, is_profile_incomplete
from app.lib.email_notify import count_active_applications, notify_account_status
from app.lib.errors import api_error, fo_api_error
from app.lib.locale import resolve_request_locale
from app.lib.consents import persist_term_consents, required_terms_consent_error
from app.lib.rev import bump_rev, check_rev, expected_rev_from_request
from app.lib.google_auth import verify_google_id_token
from app.lib.security import hash_password, verify_password
from app.lib.storage import save_photo
from app.lib.validation import (
    gender_to_code,
    is_under_minimum_age,
    is_valid_password,
    normalize_birth_date,
    validate_roster_codes,
)
from app.models.application import Application, ApplicationSubmission
from app.models.user import User

router = APIRouter(tags=["me"])
settings = get_settings()
WITHDRAW_GOOGLE_TOKEN_MAX_AGE_SECONDS = 300


class UpdateMeBody(BaseModel):
    rev: int | None = None
    name_ko: str | None = None
    name_en: str | None = None
    birth_date: str | None = None
    gender: str | None = None
    nationality: str | None = None
    first_language: str | None = None
    phone: str | None = None
    job_code: int | None = None
    motive_code: int | None = None
    purpose_code: int | None = None
    marketing_opt_in: bool | None = None
    photo_base64: str | None = None
    terms_agreed: list[dict] | None = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str
    new_password_confirm: str


class WithdrawBody(BaseModel):
    password: str | None = None
    google_id_token: str | None = None


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name_ko": user.name_ko,
        "name_en": user.name_en,
        "birth_date": user.birth_date,
        "gender": user.gender,
        "nationality": user.nationality,
        "first_language": user.first_language,
        "phone": user.phone,
        "job_code": user.job_code,
        "motive_code": user.motive_code,
        "purpose_code": user.purpose_code,
        "photo_file_id": user.photo_file_id,
        "preferred_lang": user.preferred_lang,
        "marketing_opt_in": user.marketing_opt_in,
        "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None,
        "signup_provider": user.signup_provider or "email",
        "google_linked": bool(user.google_sub),
        "has_password": bool(user.password_hash),
        "status": user.status,
        "rev": user.rev,
    }


def _verify_withdraw_google(user: User, raw_token: str, lang: str | None = None) -> None:
    if not user.google_sub:
        raise fo_api_error("VALIDATION_ERROR", "google_not_linked", lang)
    if not settings.google_oauth_enabled:
        raise fo_api_error("SERVICE_UNAVAILABLE", "google_login_disabled", lang, 503)
    token = raw_token.strip()
    if not token:
        raise fo_api_error("VALIDATION_ERROR", "google_token_required", lang)
    try:
        claims = verify_google_id_token(token, settings.google_client_id.strip())
    except ValueError as exc:
        raise fo_api_error("INVALID_TOKEN", "google_auth_failed", lang, 401) from exc
    sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()
    if sub != user.google_sub or email != user.email:
        raise fo_api_error("INVALID_TOKEN", "google_account_mismatch", lang, 401)
    iat = claims.get("iat")
    if iat is not None:
        issued = datetime.fromtimestamp(int(iat), tz=timezone.utc)
        if datetime.now(timezone.utc) - issued > timedelta(seconds=WITHDRAW_GOOGLE_TOKEN_MAX_AGE_SECONDS):
            raise fo_api_error("INVALID_TOKEN", "google_verify_expired", lang, 401)


def _verify_withdraw_password(user: User, password: str, lang: str | None = None) -> None:
    if not user.password_hash or not verify_password(password, user.password_hash):
        raise fo_api_error("INVALID_CREDENTIALS", "password_wrong", lang)


def _verify_withdraw_identity(user: User, body: WithdrawBody, lang: str | None = None) -> None:
    google_token = (body.google_id_token or "").strip()
    password = (body.password or "").strip()
    if google_token:
        _verify_withdraw_google(user, google_token, lang=lang)
        return
    if password:
        _verify_withdraw_password(user, password, lang=lang)
        return
    if user.google_sub and (user.signup_provider == "google" or not user.password_hash):
        raise fo_api_error("VALIDATION_ERROR", "verify_identity_google", lang)
    if user.password_hash:
        raise fo_api_error("VALIDATION_ERROR", "password_required", lang)
    raise fo_api_error("VALIDATION_ERROR", "verify_identity_required", lang)


@router.get("/me")
async def get_me(
    request: Request,
    auth: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    lang = resolve_request_locale(request)
    result = await db.execute(
        select(User).where(User.id == auth.id, User.status.in_(AUTH_USER_STATUSES))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise fo_api_error("NOT_FOUND", "user_not_found", lang, 404)
    return {"user": serialize_user(user), "profile_incomplete": is_profile_incomplete(user)}


@router.patch("/me")
async def update_me(
    body: UpdateMeBody,
    request: Request,
    if_match: str | None = Header(None, alias="If-Match"),
    auth: AuthUser = Depends(require_user),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(User).where(User.id == auth.id, User.status.in_(AUTH_USER_STATUSES))
    )
    lang = resolve_request_locale(request)
    user = result.scalar_one_or_none()
    if not user:
        raise fo_api_error("NOT_FOUND", "user_not_found", lang, 404)
    check_rev(user, expected_rev_from_request(request, body.rev, if_match), label="프로필")
    data = body.model_dump(exclude_unset=True)
    data.pop("rev", None)
    if "birth_date" in data and data["birth_date"]:
        birth = normalize_birth_date(data["birth_date"])
        if not birth:
            raise fo_api_error("VALIDATION_ERROR", "birth_invalid", lang)
        if is_under_minimum_age(birth):
            raise fo_api_error("AGE_RESTRICTED", "age_restricted", lang, 422, age=settings.min_signup_age_years)
        data["birth_date"] = birth
    if "gender" in data and data["gender"]:
        data["gender"] = gender_to_code(data["gender"])
    roster_err = validate_roster_codes(
        data.get("job_code"), data.get("motive_code"), data.get("purpose_code"), lang=lang
    )
    if roster_err:
        raise api_error("VALIDATION_ERROR", roster_err)
    photo_base64 = data.pop("photo_base64", None)
    terms_agreed = data.pop("terms_agreed", None)
    if is_profile_incomplete(user):
        terms_err = required_terms_consent_error(terms_agreed, lang=lang)
        if terms_err:
            raise api_error("VALIDATION_ERROR", terms_err)
    elif terms_agreed is not None:
        terms_err = required_terms_consent_error(terms_agreed, lang=lang)
        if terms_err:
            raise api_error("VALIDATION_ERROR", terms_err)
    for key, value in data.items():
        setattr(user, key, value)
    if photo_base64:
        try:
            photo = await save_photo(db, owner_type="user_photo", owner_id=user.id, photo_base64=photo_base64)
            user.photo_file_id = photo.id
            await db.execute(
                update(Application)
                .where(Application.user_id == user.id, Application.status.notin_(["cancelled", "rejected"]))
                .values(photo_file_id=photo.id, photo_review_status="pending")
            )
        except ValueError as exc:
            if str(exc) == "file_too_large":
                raise fo_api_error("VALIDATION_ERROR", "photo_too_large", lang) from exc
            raise api_error("VALIDATION_ERROR", str(exc)) from exc
    if terms_agreed is not None:
        await persist_term_consents(
            db,
            user_id=user.id,
            terms_agreed=terms_agreed,
            marketing_opt_in=user.marketing_opt_in,
            ip=ip,
        )
    bump_rev(user)
    if not is_profile_incomplete(user):
        user.status = "active"
    await db.commit()
    await db.refresh(user)
    return {"user": serialize_user(user), "profile_incomplete": is_profile_incomplete(user)}


@router.post("/me/change-password")
async def change_password(
    body: ChangePasswordBody,
    request: Request,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    lang = resolve_request_locale(request)
    result = await db.execute(select(User).where(User.id == auth.id, User.status == "active"))
    user = result.scalar_one_or_none()
    if not user:
        raise fo_api_error("NOT_FOUND", "user_not_found", lang, 404)
    if user.signup_provider != "email" or not user.password_hash:
        raise fo_api_error("VALIDATION_ERROR", "google_password_change_blocked", lang)
    if not verify_password(body.current_password, user.password_hash):
        raise fo_api_error("INVALID_CREDENTIALS", "current_password_wrong", lang)
    if not is_valid_password(body.new_password) or body.new_password != body.new_password_confirm:
        raise fo_api_error("VALIDATION_ERROR", "password_rules_check", lang)
    if verify_password(body.new_password, user.password_hash):
        raise fo_api_error("VALIDATION_ERROR", "new_password_same", lang)
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"changed": True}


@router.post("/me/withdraw")
async def withdraw(
    body: WithdrawBody,
    request: Request,
    auth: AuthUser = Depends(require_complete_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    lang = resolve_request_locale(request)
    result = await db.execute(select(User).where(User.id == auth.id, User.status == "active"))
    user = result.scalar_one_or_none()
    if not user:
        raise fo_api_error("NOT_FOUND", "user_not_found", lang, 404)
    _verify_withdraw_identity(user, body, lang=lang)
    now = datetime.now(timezone.utc)
    canceled_count = await count_active_applications(db, user.id)
    user.status = "withdrawn"
    user.withdrawn_at = now
    await db.execute(
        update(ApplicationSubmission)
        .where(ApplicationSubmission.user_id == user.id, ApplicationSubmission.cancelled_at.is_(None))
        .values(cancelled_at=now, cancel_reason="회원 탈퇴", status="cancelled")
    )
    await db.execute(
        update(Application)
        .where(Application.user_id == user.id, Application.cancelled_at.is_(None))
        .values(cancelled_at=now, cancel_reason="회원 탈퇴", status="cancelled")
    )
    await notify_account_status(db, user, action="withdrawn", canceled_applications=canceled_count)
    await db.commit()
    return {"withdrawn": True}
