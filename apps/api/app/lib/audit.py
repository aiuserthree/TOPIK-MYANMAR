from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAuditLog


def snapshot(obj: Any, fields: Sequence[str]) -> dict[str, Any]:
    """감사 로그 전·후 비교용 필드 스냅샷.

    BO 처리 이력 상세는 before_data/after_data 를 짝지어 '무엇이 어떻게 바뀌었는지'
    를 보여 준다. 한쪽만 남기면 화면에서 '이전 값 없음' 으로만 읽히므로, 값을 바꾸는
    처리에서는 변경 전후로 두 번 호출해 같은 필드 집합을 남긴다.

    datetime/date 는 JSONB 로 그대로 못 넣으므로 ISO 문자열로 변환한다.
    """
    out: dict[str, Any] = {}
    for f in fields:
        v = getattr(obj, f, None)
        if isinstance(v, (datetime, date)):
            v = v.isoformat()
        out[f] = v
    return out


# 처리 유형별 스냅샷 필드 — 전후 호출이 같은 집합을 쓰도록 여기서 한 번만 정한다.
PHOTO_REVIEW_FIELDS = ("photo_review_status", "photo_reject_code", "photo_reject_note", "status")
INFO_REVIEW_FIELDS = ("info_review_status", "info_reject_code", "info_reject_note", "status")
APPLICATION_REJECT_FIELDS = ("status", "reject_reason")
PAYMENT_FIELDS = ("payment_status", "status", "paid_at", "payment_receipt_no")
PAYMENT_CANCEL_FIELDS = ("payment_status", "payment_cancel_reason")
BOARD_POST_FIELDS = ("board_type", "category", "title", "workflow_status", "is_secret")
BOARD_REPLY_FIELDS = ("workflow_status", "admin_replied_at", "admin_replier_id")


async def write_audit(
    session: AsyncSession,
    *,
    admin_user_id: int | None,
    action_type: str,
    target_type: str,
    target_id: str | int,
    before_data: dict[str, Any] | None = None,
    after_data: dict[str, Any] | None = None,
    memo: str | None = None,
    ip_address: str | None = None,
) -> None:
    session.add(
        AdminAuditLog(
            admin_user_id=admin_user_id,
            action_type=action_type,
            target_type=target_type,
            target_id=str(target_id),
            before_data=before_data,
            after_data=after_data,
            memo=memo,
            ip_address=ip_address,
        )
    )
