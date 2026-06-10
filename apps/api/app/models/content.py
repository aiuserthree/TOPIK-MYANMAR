from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class Notice(TimestampMixin, Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    title_my: Mapped[Optional[str]] = mapped_column(String(300))
    title_en: Mapped[Optional[str]] = mapped_column(String(300))
    body_html: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    body_my: Mapped[Optional[str]] = mapped_column(Text)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    display_start_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    display_end_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    author_admin_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class FaqItem(TimestampMixin, Base):
    __tablename__ = "faq_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    question_ko: Mapped[str] = mapped_column(Text, nullable=False)
    question_my: Mapped[Optional[str]] = mapped_column(Text)
    question_en: Mapped[Optional[str]] = mapped_column(Text)
    answer_ko: Mapped[str] = mapped_column(Text, nullable=False)
    answer_my: Mapped[Optional[str]] = mapped_column(Text)
    answer_en: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Term(TimestampMixin, Base):
    __tablename__ = "terms"
    __table_args__ = (UniqueConstraint("term_type", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    term_type: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body_ko: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    body_my: Mapped[Optional[str]] = mapped_column(Text)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    effective_at: Mapped[Optional[date]] = mapped_column(Date)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class TermConsent(Base):
    """가입 시 동의한 약관 종류/버전 영속화 — db/migrations/V006 terms_consents."""

    __tablename__ = "terms_consents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    term_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("terms.id", ondelete="SET NULL")
    )
    term_type: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    agreed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
