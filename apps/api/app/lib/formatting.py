"""표시용 포매팅·라벨 헬퍼 — FO 응답 계약(계약서 5절)에서 기대하는 풍부한 모양 제공.

FO 소비 코드(fo-notices.js / fo-board.js / mypage.html / faq.html 등)가 그대로 쓰는
`category_label`, `date_formatted`, `status_label`, `created_at_label` 등을 생성한다.
"""

from __future__ import annotations

from datetime import date, datetime, timezone, timedelta

# 운영 표시 기준 시간대(한국, UTC+9). TIMESTAMPTZ(UTC) → 표시 변환에 사용.
DISPLAY_TZ = timezone(timedelta(hours=9))


def _as_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def fmt_date(dt: datetime | date | None) -> str:
    """'YYYY.MM.DD' (없으면 빈 문자열). date·datetime 모두 허용."""
    if not dt:
        return ""
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt.strftime("%Y.%m.%d")
    return _as_aware(dt).astimezone(DISPLAY_TZ).strftime("%Y.%m.%d")


def fmt_datetime(dt: datetime | None) -> str:
    """'YYYY.MM.DD HH:MM' (없으면 빈 문자열)."""
    if not dt:
        return ""
    return _as_aware(dt).astimezone(DISPLAY_TZ).strftime("%Y.%m.%d %H:%M")


def fmt_date_only(d) -> str:
    """date(또는 None) → 'YYYY.MM.DD'."""
    if not d:
        return ""
    return d.strftime("%Y.%m.%d")


# ---------------------------------------------------------------------------
# 카테고리 라벨
# ---------------------------------------------------------------------------
_NOTICE_CATEGORY_LABELS = {
    "important": "중요",
    "imp": "중요",
    "general": "일반",
    "notice": "공지",
    "registration": "접수",
    "apply": "접수",
    "exam": "시험",
    "result": "결과",
    "event": "행사",
    "etc": "기타",
    "other": "기타",
}

_NOTICE_CATEGORY_LABELS_MY = {
    "important": "အရေးကြီး",
    "imp": "အရေးကြီး",
    "general": "ယေဘုယျ",
    "notice": "ကြေညာချက်",
    "registration": "လျှောက်ထားခြင်း",
    "apply": "လျှောက်ထားခြင်း",
    "exam": "စာမေးပွဲ",
    "result": "ရလဒ်",
    "event": "ပွဲ",
    "etc": "အခြား",
    "other": "အခြား",
}

_NOTICE_CATEGORY_LABELS_EN = {
    "important": "Important",
    "imp": "Important",
    "general": "General",
    "notice": "Notice",
    "registration": "Registration",
    "apply": "Registration",
    "exam": "Exam",
    "result": "Results",
    "event": "Event",
    "etc": "Other",
    "other": "Other",
}

_FAQ_CATEGORY_LABELS = {
    "account": "계정",
    "apply": "접수",
    "registration": "접수",
    "payment": "수납",
    "photo": "사진",
    "exam": "시험",
    "result": "결과",
    "etc": "기타",
    "other": "기타",
    "general": "일반",
}

_FAQ_CATEGORY_LABELS_MY = {
    "account": "အကောင့်",
    "apply": "လျှောက်ထားခြင်း",
    "registration": "လျှောက်ထားခြင်း",
    "payment": "ကြေးသွင်း",
    "photo": "ဓာတ်ပုံ",
    "exam": "စာမေးပွဲ",
    "result": "ရလဒ်",
    "etc": "အခြား",
    "other": "အခြား",
    "general": "ယေဘုယျ",
}

_FAQ_CATEGORY_LABELS_EN = {
    "account": "Account",
    "apply": "Registration",
    "registration": "Registration",
    "payment": "Payment",
    "photo": "Photo",
    "exam": "Exam",
    "result": "Results",
    "etc": "Other",
    "other": "Other",
    "general": "General",
}


def _label_for_lang(
    key: str | None,
    ko_map: dict[str, str],
    my_map: dict[str, str],
    en_map: dict[str, str],
    lang: str | None,
    default_ko: str,
    default_my: str,
    default_en: str,
) -> str:
    lang = (lang or "ko").lower()
    if not key:
        if lang == "my":
            return default_my
        if lang == "en":
            return default_en
        return default_ko
    if lang == "my":
        return my_map.get(key, ko_map.get(key, key))
    if lang == "en":
        return en_map.get(key, ko_map.get(key, key))
    return ko_map.get(key, key)


def notice_category_label(category: str | None, lang: str | None = None) -> str:
    lang = (lang or "ko").lower()
    if not category:
        if lang == "my":
            return "ကြေညာချက်"
        if lang == "en":
            return "Notice"
        return "공지"
    if lang == "my":
        return _NOTICE_CATEGORY_LABELS_MY.get(category, _NOTICE_CATEGORY_LABELS.get(category, category))
    if lang == "en":
        return _NOTICE_CATEGORY_LABELS_EN.get(category, _NOTICE_CATEGORY_LABELS.get(category, category))
    return _NOTICE_CATEGORY_LABELS.get(category, category)


def faq_category_label(category: str | None, lang: str | None = None) -> str:
    return _label_for_lang(
        category,
        _FAQ_CATEGORY_LABELS,
        _FAQ_CATEGORY_LABELS_MY,
        _FAQ_CATEGORY_LABELS_EN,
        lang,
        "기타",
        "အခြား",
        "Other",
    )


# ---------------------------------------------------------------------------
# 게시판 workflow 상태 라벨 (fo-board.js statusClass 와 짝을 이룸)
# ---------------------------------------------------------------------------
_BOARD_STATUS_LABELS = {
    "received": "접수",
    "in_review": "처리중",
    "awaiting_reply": "답변 대기",
    "answered": "답변 완료",
    "completed": "완료",
    "rejected": "반려",
}

_BOARD_STATUS_LABELS_MY = {
    "received": "လက်ခံပြီး",
    "in_review": "စီမံဆောင်ရွက်နေဆဲ",
    "awaiting_reply": "အဖြေစောင့်ဆိုင်း",
    "answered": "အဖြေပြီး",
    "completed": "ပြီးမြောက်",
    "rejected": "ပယ်ချ",
}

_BOARD_STATUS_LABELS_EN = {
    "received": "Received",
    "in_review": "In review",
    "awaiting_reply": "Awaiting reply",
    "answered": "Answered",
    "completed": "Completed",
    "rejected": "Rejected",
}


def board_status_label(workflow_status: str | None, lang: str | None = None) -> str:
    if not workflow_status:
        return ""
    lang = (lang or "ko").lower()
    if lang == "my":
        return _BOARD_STATUS_LABELS_MY.get(workflow_status, _BOARD_STATUS_LABELS.get(workflow_status, workflow_status))
    if lang == "en":
        return _BOARD_STATUS_LABELS_EN.get(workflow_status, _BOARD_STATUS_LABELS.get(workflow_status, workflow_status))
    return _BOARD_STATUS_LABELS.get(workflow_status, workflow_status)


# ---------------------------------------------------------------------------
# 마이페이지 카드 상태(fo_card_status) — mypage.html buildCard / gateActions 기준
#   허용 값: applied, photo, pay, number, approved, photo_rejected, app_rejected, cancelled
# ---------------------------------------------------------------------------
_CARD_STATUS_LABELS = {
    "applied": "접수 완료",
    "photo": "사진 심사중",
    "pay": "수납 대기",
    "approved": "수납 완료",
    "number": "수험번호 부여",
    "photo_rejected": "사진 반려",
    "app_rejected": "반려",
    "cancelled": "접수 취소",
}

_CARD_STATUS_LABELS_MY = {
    "applied": "လျှောက်ထားပြီး",
    "photo": "ဓာတ်ပုံ စိစစ်နေဆဲ",
    "pay": "ကြေးသွင်း စောင့်ဆိုင်း",
    "approved": "ကြေးသွင်း ပြီး",
    "number": "ဖြေဆိုသူနံပါတ် ပေးအပ်",
    "photo_rejected": "ဓာတ်ပုံ ပယ်ချ",
    "app_rejected": "ပယ်ချ",
    "cancelled": "လျှောက်ထား ပယ်ဖျက်",
}

_CARD_STATUS_LABELS_EN = {
    "applied": "Submitted",
    "photo": "Photo review",
    "pay": "Payment pending",
    "approved": "Payment complete",
    "number": "Exam number assigned",
    "photo_rejected": "Photo rejected",
    "app_rejected": "Rejected",
    "cancelled": "Cancelled",
}

# 단계 진행 순서(작은 값 = 덜 진행됨). 카드는 "가장 덜 진행된 활성 급수" 기준으로 표시.
_CARD_STAGE_RANK = {
    "applied": 0,
    "photo": 1,
    "pay": 2,
    "approved": 3,
    "number": 4,
}


def card_status_label(card_status: str, lang: str | None = None) -> str:
    lang = (lang or "ko").lower()
    if lang == "my":
        return _CARD_STATUS_LABELS_MY.get(card_status, _CARD_STATUS_LABELS.get(card_status, card_status))
    if lang == "en":
        return _CARD_STATUS_LABELS_EN.get(card_status, _CARD_STATUS_LABELS.get(card_status, card_status))
    return _CARD_STATUS_LABELS.get(card_status, card_status)


def _app_stage(app_status: str, payment_status: str, exam_number: str | None) -> str:
    """application 한 건의 단계 → fo_card_status 후보."""
    if exam_number or app_status == "exam_number_assigned":
        return "number"
    if payment_status == "paid" or app_status == "approved":
        return "approved"
    if app_status == "payment_pending":
        return "pay"
    if app_status == "photo_review":
        return "photo"
    return "applied"


def derive_card_status_for_app(app, submission_cancelled: bool = False) -> str:
    """단일 application(급수) → 마이페이지 카드 상태."""
    if submission_cancelled or app.status == "cancelled" or app.cancelled_at:
        return "cancelled"
    if app.photo_review_status == "rejected":
        return "photo_rejected"
    if app.status == "rejected":
        return "app_rejected"
    return _app_stage(app.status, app.payment_status, app.exam_number)


def derive_rejection_info_for_app(app) -> dict | None:
    """단일 application 반려 사유 — FO 사유보기용."""
    if app.status == "cancelled":
        return None
    if app.photo_review_status == "rejected":
        parts: list[str] = []
        if app.photo_reject_code:
            parts.append(app.photo_reject_code)
        if app.photo_reject_note:
            parts.append(app.photo_reject_note)
        return {"type": "photo", "reason": " — ".join(parts) if parts else "사유 미기재"}
    if app.status == "rejected" and app.reject_reason:
        return {"type": "application", "reason": app.reject_reason}
    if app.status == "rejected":
        return {"type": "application", "reason": "사유 미기재"}
    return None


def derive_card_status(apps: list) -> str:
    """submission 하위 application 목록 → 카드 헤드라인 상태."""
    active = [a for a in apps if a.status != "cancelled"]
    if not active:
        return "cancelled"
    # BO 사진심사 반려(photo_review_status) → 사진 반려 배지
    if any(a.photo_review_status == "rejected" for a in active):
        return "photo_rejected"
    # BO 접수자 상세/일괄 반려(application.status) → 반려 배지
    if any(a.status == "rejected" for a in active):
        return "app_rejected"
    stages = [
        _app_stage(a.status, a.payment_status, a.exam_number)
        for a in active
        if a.status != "rejected"
    ]
    if not stages:
        return "app_rejected"
    return min(stages, key=lambda s: _CARD_STAGE_RANK.get(s, 0))


def derive_rejection_info(apps: list) -> dict | None:
    """FO 사유보기용 — 사진심사 반려 우선, 없으면 접수 반려."""
    active = [a for a in apps if a.status != "cancelled"]
    for a in active:
        if a.photo_review_status == "rejected":
            parts: list[str] = []
            if a.photo_reject_code:
                parts.append(a.photo_reject_code)
            if a.photo_reject_note:
                parts.append(a.photo_reject_note)
            return {"type": "photo", "reason": " — ".join(parts) if parts else "사유 미기재"}
    for a in active:
        if a.status == "rejected" and a.reject_reason:
            return {"type": "application", "reason": a.reject_reason}
    for a in active:
        if a.status == "rejected":
            return {"type": "application", "reason": "사유 미기재"}
    return None


def exam_number_visible(exam_number: str | None, round_visible_at: datetime | None) -> bool:
    """수험번호 FO 노출 게이팅: 부여 후, 공개일 미설정이면 즉시 노출, 설정 시 해당 시각 이후."""
    if not exam_number:
        return False
    if not round_visible_at:
        return True
    return datetime.now(timezone.utc) >= _as_aware(round_visible_at)
