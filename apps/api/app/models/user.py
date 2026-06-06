from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.application import ApplicationDraft
    from app.models.system import FileAttachment


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    signup_provider: Mapped[str] = mapped_column(String(20), nullable=False, server_default="email")
    google_sub: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(200), nullable=False)
    birth_date: Mapped[str] = mapped_column(String(8), nullable=False)
    gender: Mapped[str] = mapped_column(String(1), nullable=False)
    nationality: Mapped[str] = mapped_column(String(100), nullable=False)
    first_language: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    job_code: Mapped[int] = mapped_column(Integer, nullable=False)
    motive_code: Mapped[int] = mapped_column(Integer, nullable=False)
    purpose_code: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_file_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("file_attachments.id", ondelete="SET NULL")
    )
    preferred_lang: Mapped[str] = mapped_column(String(5), nullable=False, server_default="ko")
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    withdrawn_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rev: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    photo_file: Mapped[Optional["FileAttachment"]] = relationship("FileAttachment", lazy="select")
    application_drafts: Mapped[list["ApplicationDraft"]] = relationship(
        "ApplicationDraft", back_populates="user", cascade="all, delete-orphan"
    )
