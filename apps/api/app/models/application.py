from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class ApplicationSubmission(TimestampMixin, Base):
    __tablename__ = "application_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    exam_round_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exam_rounds.id", ondelete="RESTRICT"), nullable=False
    )
    exam_venue_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exam_venues.id", ondelete="RESTRICT"), nullable=False
    )
    photo_checklist_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    accommodation_requested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="submitted")
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text)

    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="submission", cascade="all, delete-orphan"
    )


class Application(TimestampMixin, Base):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("application_submissions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    exam_round_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exam_rounds.id", ondelete="RESTRICT"), nullable=False
    )
    exam_venue_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exam_venues.id", ondelete="RESTRICT"), nullable=False
    )
    exam_level: Mapped[str] = mapped_column(String(2), nullable=False)
    application_no: Mapped[Optional[str]] = mapped_column(String(30))
    photo_file_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("file_attachments.id", ondelete="SET NULL")
    )
    photo_review_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending"
    )
    photo_reject_code: Mapped[Optional[str]] = mapped_column(String(30))
    photo_reject_note: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="submitted")
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="unpaid")
    payment_receipt_no: Mapped[Optional[str]] = mapped_column(String(50))
    payment_memo: Mapped[Optional[str]] = mapped_column(Text)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    payment_cancel_reason: Mapped[Optional[str]] = mapped_column(Text)
    exam_number: Mapped[Optional[str]] = mapped_column(String(13))
    exam_number_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    reject_reason: Mapped[Optional[str]] = mapped_column(Text)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rev: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    submission: Mapped["ApplicationSubmission"] = relationship(
        "ApplicationSubmission", back_populates="applications"
    )
    memos: Mapped[list["ApplicationMemo"]] = relationship(
        "ApplicationMemo", back_populates="application", cascade="all, delete-orphan"
    )


class ApplicationMemo(Base):
    __tablename__ = "application_memos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    admin_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    application: Mapped["Application"] = relationship("Application", back_populates="memos")


class ApplicationDraft(Base):
    """FO register.html temp save — matches db/migrations/V005__application_drafts.sql."""

    __tablename__ = "application_drafts"
    __table_args__ = (
        UniqueConstraint("user_id", name="application_drafts_user_unique"),
        Index("idx_application_drafts_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW() + INTERVAL '30 days'"),
    )

    user: Mapped["User"] = relationship("User", back_populates="application_drafts")
