"""Append-only access logs for BO audit screens."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_log import AdminAccessLog, MemberAccessLog


async def write_admin_access(
    session: AsyncSession,
    *,
    action_type: str,
    success: bool = True,
    admin_user_id: int | None = None,
    admin_email: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    memo: str | None = None,
) -> None:
    session.add(
        AdminAccessLog(
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            action_type=action_type,
            success=success,
            ip_address=ip_address,
            user_agent=(user_agent or "")[:2000] or None,
            memo=memo,
        )
    )


async def write_member_access(
    session: AsyncSession,
    *,
    action_type: str,
    success: bool = True,
    user_id: int | None = None,
    email: str | None = None,
    path: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    memo: str | None = None,
) -> None:
    session.add(
        MemberAccessLog(
            user_id=user_id,
            email=email,
            action_type=action_type,
            path=path,
            success=success,
            ip_address=ip_address,
            user_agent=(user_agent or "")[:2000] or None,
            memo=memo,
        )
    )
