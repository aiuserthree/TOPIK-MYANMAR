from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, BeforeValidator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db_session
from app.lib.audit import write_audit
from app.lib.deps import AuthUser, get_client_ip, get_optional_user
from app.lib.errors import api_error
from app.lib.security import (
    create_access_token,
    create_email_verify_token,
    create_refresh_token,
    decode_email_verify_token,
    decode_refresh_token,
    hash_code,
    hash_password,
    verify_code,
    verify_password,
)
from app.lib.consents import persist_term_consents
from app.lib.email_notify import notify_password_expiry_reminder
from app.lib.google_auth import verify_google_id_token
from app.lib.profile import (
    PROFILE_INCOMPLETE_BIRTH,
    SIGNUP_PENDING_STATUS,
    WITHDRAW_REREGISTRATION_DAYS,
    AUTH_USER_STATUSES,
    is_profile_incomplete,
    is_full_member,
    remove_incomplete_signup_user,
    remove_withdrawn_user_for_reregister,
    withdrawn_rejoin_days_remaining,
)
from app.lib.mail import (
    cancel_pending_outbox,
    enqueue_email,
    format_verification_code,
    mail_delivery_status,
)
from app.models.system import EmailOutbox
from app.lib.storage import save_photo
from app.lib.validation import (
    gender_to_code,
    is_under_minimum_age,
    is_valid_email,
    is_valid_password,
    normalize_birth_date,
    validate_roster_codes,
)
from app.models.admin import AdminUser
from app.models.auth_tokens import EmailVerificationCode, PasswordResetToken
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

LOGIN_MAX_FAIL = 5
LOGIN_LOCK_MINUTES = 30


async def _prepare_existing_user_for_signup(db: AsyncSession, existing_user: User | None) -> None:
    """가입 전 기존 이메일 행 정리. 탈퇴 30일 이내·정지·기가입은 차단."""
    if not existing_user:
        return
    if existing_user.status == "suspended":
        raise api_error("ACCOUNT_INACTIVE", "이용이 제한된 계정입니다.", 403)
    remaining = withdrawn_rejoin_days_remaining(existing_user)
    if remaining is not None:
        raise api_error(
            "REJOIN_RESTRICTED",
            f"탈퇴 후 {WITHDRAW_REREGISTRATION_DAYS}일간 동일 이메일로 재가입할 수 없습니다. ({remaining}일 후 가능)",
            403,
        )
    if existing_user.status == "withdrawn":
        await remove_withdrawn_user_for_reregister(db, existing_user)
        return
    if is_full_member(existing_user):
        raise api_error("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일입니다.", 409)
    await remove_incomplete_signup_user(db, existing_user)


def _normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not is_valid_email(email):
        raise ValueError("유효한 이메일을 입력해 주세요.")
    return email


EmailField = Annotated[str, BeforeValidator(_normalize_email)]


class LoginBody(BaseModel):
    email: EmailField
    password: str
    portal: str | None = None  # "fo" | "bo" — 동일 이메일이 회원·관리자에 모두 있을 때 구분


class RefreshBody(BaseModel):
    refresh_token: str


class SendCodeBody(BaseModel):
    email: EmailField
    preferred_lang: str | None = None


class VerifyEmailBody(BaseModel):
    email: EmailField
    code: str


class RegisterBody(BaseModel):
    verification_token: str
    email: EmailField
    password: str | None = None
    password_confirm: str | None = None
    name_ko: str
    name_en: str
    birth_date: str
    gender: str
    nationality: str
    first_language: str
    phone: str
    job_code: int
    motive_code: int
    purpose_code: int
    photo_base64: str | None = None
    marketing_opt_in: bool = False
    preferred_lang: str = "ko"
    # 동의한 약관 항목/버전(계약서 6.4). 예: [{"term_type":"service","version":"1.0","agreed":true}]
    terms_agreed: list[dict] = []


class FindEmailBody(BaseModel):
    name_ko: str
    birth_date: str
    phone: str


class GoogleAuthBody(BaseModel):
    id_token: str
    preferred_lang: str = "ko"


class ForgotPasswordBody(BaseModel):
    email: EmailField
    preferred_lang: str | None = None


class ResetPasswordBody(BaseModel):
    email: EmailField
    reset_token: str
    password: str
    password_confirm: str


def _normalize_preferred_lang(raw: str | None, fallback: str = "ko") -> str:
    lang = (raw or fallback or "ko")[:5]
    if lang not in ("ko", "my", "en"):
        fb = (fallback or "ko")[:5]
        return fb if fb in ("ko", "my", "en") else "ko"
    return lang


def _resolve_request_locale(body_lang: str | None, request: Request | None = None) -> str:
    """FO UI language at request time — body field, then X-TPKM-Locale header, else ko."""
    if body_lang and str(body_lang).strip():
        return _normalize_preferred_lang(body_lang)
    if request is not None:
        header = request.headers.get("x-tpkm-locale")
        if header and header.strip():
            return _normalize_preferred_lang(header.strip())
    return "ko"


def _user_token_response(user: User) -> dict:
    claims = {"email": user.email, "role": "user"}
    return {
        "access_token": create_access_token(f"user:{user.id}", claims),
        "refresh_token": create_refresh_token(f"user:{user.id}", claims),
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name_ko": user.name_ko,
            "name_en": user.name_en,
            "role": "user",
            "preferred_lang": user.preferred_lang,
        },
    }


def _admin_token_response(admin: AdminUser) -> dict:
    claims = {"email": admin.email, "role": admin.role}
    return {
        "access_token": create_access_token(f"admin:{admin.id}", claims),
        "refresh_token": create_refresh_token(f"admin:{admin.id}", claims),
        "token_type": "bearer",
        "user": {
            "id": admin.id,
            "email": admin.email,
            "name": admin.name,
            "role": admin.role,
            "must_change_password": admin.must_change_password,
        },
    }


@router.get("/status")
async def auth_status() -> dict[str, str]:
    return {"status": "ok", "message": "TOPIK Myanmar API"}


@router.get("/google/config")
async def google_config() -> dict:
    client_id = settings.google_client_id.strip()
    return {"enabled": bool(client_id), "client_id": client_id or None}


def _google_display_names(claims: dict) -> tuple[str, str]:
    full = (claims.get("name") or "").strip()
    given = (claims.get("given_name") or "").strip()
    family = (claims.get("family_name") or "").strip()
    email = (claims.get("email") or "").strip()
    local = email.split("@")[0] if email else "User"
    name_ko = full or f"{family}{given}".strip() or local
    name_en = (full or f"{given} {family}".strip() or local).upper()
    return name_ko[:100], name_en[:200]


@router.post("/google")
async def google_login(
    body: GoogleAuthBody,
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    if not settings.google_oauth_enabled:
        raise api_error("SERVICE_UNAVAILABLE", "Google 로그인이 설정되지 않았습니다.", 503)
    token = body.id_token.strip()
    if not token:
        raise api_error("VALIDATION_ERROR", "Google 인증 토큰이 필요합니다.", 400)
    try:
        claims = verify_google_id_token(token, settings.google_client_id.strip())
    except ValueError as exc:
        raise api_error("INVALID_TOKEN", "Google 인증에 실패했습니다.", 401) from exc

    sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()
    if not sub or not email:
        raise api_error("INVALID_TOKEN", "Google 계정 정보가 부족합니다.", 401)
    if not claims.get("email_verified", True):
        raise api_error("INVALID_TOKEN", "이메일이 인증되지 않은 Google 계정입니다.", 401)

    is_new_user = False
    by_sub = await db.execute(select(User).where(User.google_sub == sub))
    user = by_sub.scalar_one_or_none()
    if not user:
        by_email = await db.execute(select(User).where(User.email == email))
        user = by_email.scalar_one_or_none()

    if user:
        if user.status == "suspended":
            raise api_error("ACCOUNT_INACTIVE", "이용이 제한된 계정입니다.", 403)
        remaining = withdrawn_rejoin_days_remaining(user)
        if remaining is not None:
            raise api_error(
                "REJOIN_RESTRICTED",
                f"탈퇴 후 {WITHDRAW_REREGISTRATION_DAYS}일간 동일 이메일로 재가입할 수 없습니다. ({remaining}일 후 가능)",
                403,
            )
        if user.status == "withdrawn":
            await remove_withdrawn_user_for_reregister(db, user)
            user = None
    if user:
        if is_profile_incomplete(user):
            if user.status != SIGNUP_PENDING_STATUS:
                user.status = SIGNUP_PENDING_STATUS
        if not user.google_sub:
            user.google_sub = sub
        _reset_login_state(user)
    else:
        is_new_user = True
        name_ko, name_en = _google_display_names(claims)
        lang = (body.preferred_lang or "ko")[:5]
        if lang not in ("ko", "my", "en"):
            lang = "ko"
        user = User(
            email=email,
            password_hash=None,
            signup_provider="google",
            google_sub=sub,
            name_ko=name_ko,
            name_en=name_en,
            birth_date=PROFILE_INCOMPLETE_BIRTH,
            gender="1",
            nationality="",
            first_language=lang,
            phone="",
            job_code=0,
            motive_code=0,
            purpose_code=0,
            preferred_lang=lang,
            status=SIGNUP_PENDING_STATUS,
        )
        db.add(user)
        await db.flush()
        _reset_login_state(user)

    await db.commit()
    await db.refresh(user)
    out = _user_token_response(user)
    out["is_new_user"] = is_new_user
    out["profile_incomplete"] = is_profile_incomplete(user)
    return out


def _is_locked(account) -> bool:
    return bool(account.login_locked_until) and account.login_locked_until > datetime.now(timezone.utc)


def _register_login_failure(account) -> None:
    account.failed_login_count = (account.failed_login_count or 0) + 1
    if account.failed_login_count >= LOGIN_MAX_FAIL:
        account.login_locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCK_MINUTES)
        account.failed_login_count = 0


def _reset_login_state(account) -> None:
    account.failed_login_count = 0
    account.login_locked_until = None
    account.last_login_at = datetime.now(timezone.utc)


_LOCK_MESSAGE = (
    f"로그인 {LOGIN_MAX_FAIL}회 실패로 계정이 잠겼습니다. "
    f"{LOGIN_LOCK_MINUTES}분 후 다시 시도해 주세요."
)

PASSWORD_REMINDER_DAYS = 180
PASSWORD_REMINDER_COOLDOWN_DAYS = 30


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    visible = local[:1] if local else ""
    return f"{visible}***@{domain}"


def _password_change_due(user: User) -> bool:
    if user.signup_provider != "email" or not user.password_changed_at:
        return False
    days = (datetime.now(timezone.utc) - user.password_changed_at).days
    return days >= PASSWORD_REMINDER_DAYS


async def _maybe_password_reminder(db: AsyncSession, user: User) -> None:
    if not user.password_changed_at or user.signup_provider != "email":
        return
    now = datetime.now(timezone.utc)
    days = (now - user.password_changed_at).days
    if days < PASSWORD_REMINDER_DAYS:
        return
    cooldown = now - timedelta(days=PASSWORD_REMINDER_COOLDOWN_DAYS)
    recent = await db.execute(
        select(EmailOutbox.id)
        .where(
            EmailOutbox.user_id == user.id,
            EmailOutbox.template_key == "password_expiry_reminder",
            EmailOutbox.created_at >= cooldown,
        )
        .limit(1)
    )
    if recent.scalar_one_or_none():
        return
    await notify_password_expiry_reminder(db, user, days_since=days)


async def _login_admin(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    ip: str | None,
) -> dict:
    admin_res = await db.execute(select(AdminUser).where(AdminUser.email == email, AdminUser.status == "active"))
    admin = admin_res.scalar_one_or_none()
    if not admin:
        raise api_error("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401)
    if _is_locked(admin):
        raise api_error("ACCOUNT_LOCKED", _LOCK_MESSAGE, 423)
    if not verify_password(password, admin.password_hash):
        _register_login_failure(admin)
        await db.commit()
        raise api_error("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401)
    _reset_login_state(admin)
    await write_audit(
        db, admin_user_id=admin.id, action_type="login",
        target_type="admin_users", target_id=admin.id, ip_address=ip,
    )
    await db.commit()
    return _admin_token_response(admin)


async def _login_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
) -> dict:
    user_res = await db.execute(select(User).where(User.email == email, User.status == "active"))
    user = user_res.scalar_one_or_none()
    if not user:
        raise api_error("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401)
    if is_profile_incomplete(user):
        raise api_error("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401)
    if _is_locked(user):
        raise api_error("ACCOUNT_LOCKED", _LOCK_MESSAGE, 423)
    if not verify_password(password, user.password_hash):
        _register_login_failure(user)
        await db.commit()
        raise api_error("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401)
    _reset_login_state(user)
    await _maybe_password_reminder(db, user)
    await db.commit()
    out = _user_token_response(user)
    out["profile_incomplete"] = is_profile_incomplete(user)
    out["password_change_due"] = _password_change_due(user)
    return out


@router.post("/login")
async def login(
    body: LoginBody,
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    email = body.email.strip().lower()
    portal = (body.portal or "").strip().lower() or None

    if portal == "fo":
        return await _login_user(db, email=email, password=body.password)
    if portal == "bo":
        return await _login_admin(db, email=email, password=body.password, ip=ip)

    # portal 미지정(구 FO 페이지·캐시된 api-client): 동일 이메일이 회원·관리자에 있으면 회원 우선
    user_res = await db.execute(select(User).where(User.email == email, User.status == "active"))
    if user_res.scalar_one_or_none():
        return await _login_user(db, email=email, password=body.password)
    return await _login_admin(db, email=email, password=body.password, ip=ip)


@router.post("/find-email")
async def find_email(body: FindEmailBody, db: AsyncSession = Depends(get_db_session)) -> dict:
    birth = normalize_birth_date(body.birth_date)
    if not birth:
        raise api_error("VALIDATION_ERROR", "생년월일 형식이 올바르지 않습니다.")
    name = body.name_ko.strip()
    phone = body.phone.strip()
    result = await db.execute(
        select(User.email, User.signup_provider).where(
            User.name_ko == name,
            User.birth_date == birth,
            User.phone == phone,
            User.status == "active",
        )
    )
    matches = [
        {
            "email_masked": _mask_email(row.email),
            "provider": row.signup_provider or "email",
        }
        for row in result.all()
    ]
    return {"matches": matches}


@router.post("/logout")
async def logout(
    auth: AuthUser | None = Depends(get_optional_user),
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    # 토큰 폐기는 클라이언트에서 수행. 관리자 로그아웃은 audit 기록(계약서 7절).
    if auth and auth.is_admin:
        await write_audit(
            db, admin_user_id=auth.id, action_type="logout",
            target_type="admin_users", target_id=auth.id, ip_address=ip,
        )
        await db.commit()
    return {"logged_out": True}


@router.post("/refresh")
async def refresh(body: RefreshBody, db: AsyncSession = Depends(get_db_session)) -> dict:
    payload = decode_refresh_token(body.refresh_token)
    if not payload or not payload.get("sub"):
        raise api_error("INVALID_TOKEN", "유효하지 않은 refresh token입니다.", 401)
    sub = str(payload["sub"])
    kind, _, ident = sub.partition(":")
    if kind == "user":
        result = await db.execute(
            select(User).where(User.id == int(ident), User.status.in_(AUTH_USER_STATUSES))
        )
        user = result.scalar_one_or_none()
        if not user:
            raise api_error("INVALID_TOKEN", "사용자를 찾을 수 없습니다.", 401)
        return {
            "access_token": create_access_token(sub, {"email": user.email, "role": "user"}),
            "refresh_token": create_refresh_token(sub, {"email": user.email, "role": "user"}),
            "token_type": "bearer",
        }
    if kind == "admin":
        result = await db.execute(select(AdminUser).where(AdminUser.id == int(ident), AdminUser.status == "active"))
        admin = result.scalar_one_or_none()
        if not admin:
            raise api_error("INVALID_TOKEN", "관리자를 찾을 수 없습니다.", 401)
        return {
            "access_token": create_access_token(sub, {"email": admin.email, "role": admin.role}),
            "refresh_token": create_refresh_token(sub, {"email": admin.email, "role": admin.role}),
            "token_type": "bearer",
        }
    raise api_error("INVALID_TOKEN", "유효하지 않은 refresh token입니다.", 401)


@router.post("/send-verification-code")
async def send_verification_code(
    body: SendCodeBody,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    email = body.email.strip().lower()
    if not is_valid_email(email):
        raise api_error("VALIDATION_ERROR", "유효한 이메일을 입력해 주세요.")
    existing = await db.execute(select(User).where(User.email == email))
    existing_user = existing.scalar_one_or_none()
    await _prepare_existing_user_for_signup(db, existing_user)
    code = f"{random.randint(100000, 999999)}"
    await db.execute(delete(EmailVerificationCode).where(EmailVerificationCode.email == email))
    db.add(
        EmailVerificationCode(
            email=email,
            code_hash=hash_code(code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
    )
    await cancel_pending_outbox(db, to_email=email, template_key="signup_verify_code")
    mail_result = await enqueue_email(
        db,
        template_key="signup_verify_code",
        to_email=email,
        locale=_resolve_request_locale(body.preferred_lang, request),
        variables={
            "userName": email.split("@")[0],
            "verificationCode": format_verification_code(code),
            "expiresMinutes": "5",
        },
    )
    await db.commit()
    out: dict = {
        "sent": True,
        "mail_delivered": mail_delivery_status(mail_result),
        "expires_in_seconds": 300,
    }
    if settings.is_development:
        out["dev_code"] = code
    return out


@router.post("/verify-email")
async def verify_email(body: VerifyEmailBody, db: AsyncSession = Depends(get_db_session)) -> dict:
    email = body.email.strip().lower()
    result = await db.execute(
        select(EmailVerificationCode)
        .where(EmailVerificationCode.email == email)
        .order_by(EmailVerificationCode.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row or row.expires_at < datetime.now(timezone.utc) or not verify_code(body.code, row.code_hash):
        raise api_error("INVALID_CODE", "인증코드가 올바르지 않거나 만료되었습니다.", 400)
    token = create_email_verify_token(email)
    await db.execute(delete(EmailVerificationCode).where(EmailVerificationCode.email == email))
    await db.commit()
    return {"verified": True, "verification_token": token}


@router.post("/register")
async def register(
    body: RegisterBody,
    ip: str | None = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    email = decode_email_verify_token(body.verification_token)
    if not email or email != body.email.strip().lower():
        raise api_error("INVALID_TOKEN", "이메일 인증이 필요합니다.", 400)
    if not body.password or not is_valid_password(body.password):
        raise api_error("VALIDATION_ERROR", "비밀번호는 8자 이상, 영문·숫자·특수문자를 포함해야 합니다.")
    if body.password != body.password_confirm:
        raise api_error("VALIDATION_ERROR", "비밀번호 확인이 일치하지 않습니다.")
    birth = normalize_birth_date(body.birth_date)
    if not birth:
        raise api_error("VALIDATION_ERROR", "생년월일 형식이 올바르지 않습니다.")
    if is_under_minimum_age(birth):
        raise api_error("AGE_RESTRICTED", f"만 {settings.min_signup_age_years}세 미만은 회원가입할 수 없습니다.", 422)
    roster_err = validate_roster_codes(body.job_code, body.motive_code, body.purpose_code)
    if roster_err:
        raise api_error("VALIDATION_ERROR", roster_err)

    existing = await db.execute(select(User).where(User.email == email))
    existing_user = existing.scalar_one_or_none()
    await _prepare_existing_user_for_signup(db, existing_user)

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        name_ko=body.name_ko.strip(),
        name_en=body.name_en.strip(),
        birth_date=birth,
        gender=gender_to_code(body.gender),
        nationality=body.nationality.strip(),
        first_language=body.first_language.strip(),
        phone=body.phone.strip(),
        job_code=body.job_code,
        motive_code=body.motive_code,
        purpose_code=body.purpose_code,
        marketing_opt_in=body.marketing_opt_in,
        preferred_lang=body.preferred_lang[:5] if body.preferred_lang else "ko",
        password_changed_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    if body.photo_base64:
        try:
            photo = await save_photo(db, owner_type="user_photo", owner_id=user.id, photo_base64=body.photo_base64)
            user.photo_file_id = photo.id
        except ValueError as exc:
            raise api_error("VALIDATION_ERROR", str(exc)) from exc
    await persist_term_consents(
        db,
        user_id=user.id,
        terms_agreed=body.terms_agreed,
        marketing_opt_in=body.marketing_opt_in,
        ip=ip,
    )
    _reset_login_state(user)
    await db.commit()
    await db.refresh(user)
    out = _user_token_response(user)
    out["profile_incomplete"] = is_profile_incomplete(user)
    return out


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordBody,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    email = body.email.strip().lower()
    user_res = await db.execute(select(User).where(User.email == email, User.status == "active"))
    user = user_res.scalar_one_or_none()
    if not user:
        return {"sent": False, "registered": False}
    if user.signup_provider != "email" or not user.password_hash:
        return {"sent": False, "registered": True, "provider": user.signup_provider}

    code = f"{random.randint(100000, 999999)}"
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.email == email))
    db.add(
        PasswordResetToken(
            email=email,
            code_hash=hash_code(code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
    )
    await cancel_pending_outbox(db, to_email=email, template_key="password_reset")
    mail_result = await enqueue_email(
        db,
        template_key="password_reset",
        to_email=email,
        locale=_resolve_request_locale(body.preferred_lang, request),
        variables={
            "userName": user.name_ko or email.split("@")[0],
            "verificationCode": format_verification_code(code),
            "expiresMinutes": "30",
        },
    )
    await db.commit()
    out: dict = {
        "sent": True,
        "registered": True,
        "provider": "email",
        "mail_delivered": mail_delivery_status(mail_result),
        "expires_in_seconds": 1800,
    }
    if settings.is_development:
        out["dev_code"] = code
    return out


@router.post("/verify-reset-code")
async def verify_reset_code(body: VerifyEmailBody, db: AsyncSession = Depends(get_db_session)) -> dict:
    email = body.email.strip().lower()
    result = await db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.email == email, PasswordResetToken.used_at.is_(None))
        .order_by(PasswordResetToken.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row or row.expires_at < datetime.now(timezone.utc) or not verify_code(body.code, row.code_hash):
        raise api_error("INVALID_CODE", "인증코드가 올바르지 않거나 만료되었습니다.", 400)
    reset_token = secrets.token_urlsafe(32)
    row.code_hash = hash_code(reset_token)
    await db.commit()
    return {"verified": True, "reset_token": reset_token}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordBody, db: AsyncSession = Depends(get_db_session)) -> dict:
    email = body.email.strip().lower()
    if not is_valid_password(body.password) or body.password != body.password_confirm:
        raise api_error("VALIDATION_ERROR", "비밀번호 규칙을 확인해 주세요.")
    result = await db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.email == email, PasswordResetToken.used_at.is_(None))
        .order_by(PasswordResetToken.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row or row.expires_at < datetime.now(timezone.utc) or not verify_code(body.reset_token, row.code_hash):
        raise api_error("INVALID_TOKEN", "재설정 토큰이 유효하지 않습니다.", 400)
    user_res = await db.execute(select(User).where(User.email == email, User.status == "active"))
    user = user_res.scalar_one_or_none()
    if not user:
        raise api_error("NOT_FOUND", "사용자를 찾을 수 없습니다.", 404)
    user.password_hash = hash_password(body.password)
    user.password_changed_at = datetime.now(timezone.utc)
    row.used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"reset": True}
