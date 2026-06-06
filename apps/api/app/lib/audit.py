from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAuditLog


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
