from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class AdminUser(TimestampMixin, Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="admin")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    login_locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    board_notify_opt_in: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )


class AdminPermissionMatrix(Base):
    """Single-row store: role → menu_id → allowed actions (super is implicit full access)."""

    __tablename__ = "admin_permission_matrix"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, server_default="1")
    matrix: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_by_admin_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(50), nullable=False)
    before_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    after_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
