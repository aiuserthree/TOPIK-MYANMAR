"""예외 접수 처리(제110회~) — BO 관리자 예외 3종의 공통 규칙.

운영에서 실제로 막히는 세 가지를 관리자 권한으로 풀어 주되, 정원과 감사 기록은
일반 접수와 똑같이 지킨다.

1. **급수 정정**(``level_change``) — 토픽 Ⅰ·Ⅱ 를 혼동해 접수한 응시자의 급수를
   바꾼다. 옮겨 갈 급수의 정원이 비어 있을 때만 허용한다(옛 급수 좌석은 이동과
   동시에 비므로 대상 급수만 검사하면 된다).
2. **취소 복원**(``reinstate``) — 정보 수정 중 '취소'를 잘못 눌러 마감 이후
   재신청이 막힌 접수를 되살린다. 취소 직전 단계(``cancelled_from_status``)로
   정확히 되돌리고, 그 값이 없는 옛 행만 심사·수납 상태로 역산한다.
3. **지정 접수**(``designated``) — 한국 교민 자녀 등 특별 관리 대상을 마감 이후
   관리자가 직접 접수한다.

세 처리 모두 ``applications.exception_*`` 에 유형·사유·시각·처리자를 남긴다.
감사 로그와 이중으로 기록하는 이유는, 연명부·통계에서 '예외 처리 건'만 따로
뽑아야 하기 때문이다(감사 로그는 접수 행과 조인하기 불편하다).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.capacity import (
    count_active_round_level_applications,
    count_active_round_submissions,
    count_active_venue_level_applications,
    count_active_venue_submissions,
    level_capacity,
    normalize_level,
)
from app.lib.errors import api_error
from app.models.application import Application, ApplicationSubmission
from app.models.exam import ExamRound, ExamVenue

EXCEPTION_TYPES: tuple[str, ...] = ("level_change", "reinstate", "designated")

EXCEPTION_TYPE_LABELS: dict[str, str] = {
    "level_change": "급수 정정",
    "reinstate": "취소 복원",
    "designated": "지정 접수",
}

LEVEL_TEXT = {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"}

# 복원 시 되돌릴 수 있는 단계 — 취소 직전 값이 이 밖이면 역산으로 대체한다.
RESTORABLE_STATUSES: tuple[str, ...] = (
    "submitted",
    "photo_review",
    "payment_pending",
    "approved",
    "exam_number_assigned",
    "rejected",
)

EXCEPTION_FIELDS = ("exception_type", "exception_reason", "exception_at", "exception_admin_id")
LEVEL_CHANGE_FIELDS = ("exam_level", "application_no", *EXCEPTION_FIELDS)
REINSTATE_FIELDS = ("status", "cancelled_at", "cancel_reason", *EXCEPTION_FIELDS)


def level_text(level: str | None) -> str:
    return LEVEL_TEXT.get(normalize_level(level), str(level or "—"))


def require_reason(raw: str | None, *, label: str = "예외 처리 사유") -> str:
    reason = (raw or "").strip()
    if not reason:
        raise api_error("VALIDATION_ERROR", f"{label}를 입력해 주세요.", 400)
    return reason


def mark_exception(
    app: Application,
    *,
    exception_type: str,
    reason: str,
    admin_user_id: int | None,
    now: datetime | None = None,
) -> None:
    """접수 행에 예외 처리 흔적을 남긴다(마지막 처리 기준으로 덮어쓴다)."""
    if exception_type not in EXCEPTION_TYPES:
        raise api_error("VALIDATION_ERROR", f"알 수 없는 예외 처리 유형: {exception_type}", 400)
    app.exception_type = exception_type
    app.exception_reason = reason
    app.exception_at = now or datetime.now(timezone.utc)
    app.exception_admin_id = admin_user_id


def remember_cancel_status(row: Application | ApplicationSubmission) -> None:
    """취소 직전 status 보관 — 관리자 복원이 원래 단계로 되돌리는 근거."""
    current = (getattr(row, "status", "") or "").strip()
    if current and current != "cancelled":
        row.cancelled_from_status = current


def is_cancelled(app: Application) -> bool:
    return app.status == "cancelled" or bool(app.cancelled_at)


def is_active_seat(app: Application) -> bool:
    """정원(좌석)을 차지하고 있는 접수 행인지 — 취소·삭제 건은 제외."""
    return not is_cancelled(app) and not bool(app.is_deleted)


def status_after_reinstate(app: Application) -> str:
    """취소 복원 후 단계.

    ``cancelled_from_status`` 가 있으면 그대로 되돌린다. V023 이전에 취소된 행에는
    그 값이 없으므로 사진·정보 심사와 수납 상태로 단계를 역산한다.
    """
    saved = (app.cancelled_from_status or "").strip()
    if saved in RESTORABLE_STATUSES:
        return saved
    if (app.reject_reason or "").strip():
        return "rejected"
    if app.photo_review_status == "rejected":
        return "photo_review"
    if app.photo_review_status == "approved" and app.info_review_status == "approved":
        if app.payment_status == "paid" and app.approved_at:
            return "approved"
        return "payment_pending"
    return "submitted"


def _seat_error(code: str, what: str, *, capacity: int, active: int, hint: str) -> None:
    raise api_error(
        code,
        f"{what} 정원이 가득 찼습니다. (정원 {capacity}명 / 접수 {active}명) {hint}",
        409,
    )


_ROUND_HINT = "회차 관리에서 정원을 늘린 뒤 다시 시도해 주세요."
_VENUE_HINT = "다른 시험장을 선택하거나 시험장 정원을 늘려 주세요."


async def assert_level_seat_free(
    db: AsyncSession,
    *,
    exam_round: ExamRound,
    venue: ExamVenue,
    level: str,
) -> None:
    """회차·시험장의 해당 급수 정원에 자리가 남아 있는지 확인한다(0=무제한)."""
    lv = normalize_level(level)
    label = level_text(lv)

    round_cap = level_capacity(exam_round, lv)
    if round_cap > 0:
        active = await count_active_round_level_applications(
            db, exam_round_id=exam_round.id, level=lv
        )
        if active >= round_cap:
            _seat_error(
                "ROUND_LEVEL_FULL", f"회차 {label}", capacity=round_cap, active=active, hint=_ROUND_HINT
            )

    venue_cap = level_capacity(venue, lv)
    if venue_cap > 0:
        active = await count_active_venue_level_applications(
            db, exam_round_id=exam_round.id, exam_venue_id=venue.id, level=lv
        )
        if active >= venue_cap:
            _seat_error(
                "VENUE_LEVEL_FULL",
                f"{venue.name_ko} {label}",
                capacity=venue_cap,
                active=active,
                hint=_VENUE_HINT,
            )


async def assert_person_seat_free(
    db: AsyncSession,
    *,
    exam_round: ExamRound,
    venue: ExamVenue,
) -> None:
    """회차·시험장의 전체 정원(사람 수)에 자리가 남아 있는지 확인한다(0=무제한)."""
    round_cap = int(exam_round.capacity or 0)
    if round_cap > 0:
        active = await count_active_round_submissions(db, exam_round.id)
        if active >= round_cap:
            _seat_error(
                "ROUND_FULL", "회차 전체", capacity=round_cap, active=active, hint=_ROUND_HINT
            )

    venue_cap = int(venue.capacity or 0)
    if venue_cap > 0:
        active = await count_active_venue_submissions(
            db, exam_round_id=exam_round.id, exam_venue_id=venue.id
        )
        if active >= venue_cap:
            _seat_error(
                "VENUE_FULL", venue.name_ko, capacity=venue_cap, active=active, hint=_VENUE_HINT
            )


def reset_for_reintake(app: Application, *, venue_id: int, photo_file_id: int | None) -> None:
    """취소된 급수 행을 새 접수로 되살린다(지정 접수에서만 사용).

    복원(reinstate)과 달리 '새로 접수한 것'이므로 심사·수납을 초기화한다.
    FO ``_reactivate_application`` 과 같은 규칙이다.
    """
    app.exam_venue_id = venue_id
    app.photo_file_id = photo_file_id
    app.status = "submitted"
    app.photo_review_status = "pending"
    app.photo_reject_code = None
    app.photo_reject_note = None
    app.info_review_status = "approved"
    app.info_reject_code = None
    app.info_reject_note = None
    app.reject_reason = None
    app.cancelled_at = None
    app.cancel_reason = None
    app.cancelled_from_status = None
    app.payment_status = "unpaid"
    app.payment_receipt_no = None
    app.paid_at = None
    app.payment_memo = None
    app.payment_cancel_reason = None
