from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


class CountryRegionCode(Base):
    __tablename__ = "country_region_codes"
    __table_args__ = (UniqueConstraint("country_code", "region_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False)
    region_code: Mapped[str] = mapped_column(String(3), nullable=False)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(100))


class ExamVenue(TimestampMixin, Base):
    __tablename__ = "exam_venues"
    __table_args__ = (
        ForeignKeyConstraint(
            ["country_code", "region_code"],
            ["country_region_codes.country_code", "country_region_codes.region_code"],
        ),
        # 시험장코드(④)는 지역 내 01부터 → 지역별 UNIQUE (전역 UNIQUE 아님).
        UniqueConstraint(
            "country_code", "region_code", "venue_code",
            name="exam_venues_region_venue_unique",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    venue_code: Mapped[str] = mapped_column(String(2), nullable=False)
    name_ko: Mapped[str] = mapped_column(String(200), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(200))
    name_my: Mapped[Optional[str]] = mapped_column(String(200))
    address: Mapped[Optional[str]] = mapped_column(Text)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False, server_default="025")
    region_code: Mapped[str] = mapped_column(String(3), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    memo: Mapped[Optional[str]] = mapped_column(Text)


class ExamRound(TimestampMixin, Base):
    __tablename__ = "exam_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_no: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    result_date: Mapped[Optional[date]] = mapped_column(Date)
    registration_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    registration_end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fee_level_i: Mapped[int] = mapped_column(Integer, nullable=False)
    fee_level_ii: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    registration_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="scheduled"
    )
    exam_number_visible_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    exam_numbers_assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    venue_links: Mapped[list["ExamRoundVenue"]] = relationship(
        "ExamRoundVenue", back_populates="exam_round", cascade="all, delete-orphan"
    )


class ExamRoundVenue(Base):
    __tablename__ = "exam_round_venues"

    exam_round_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exam_rounds.id", ondelete="CASCADE"), primary_key=True
    )
    exam_venue_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exam_venues.id", ondelete="RESTRICT"), primary_key=True
    )

    exam_round: Mapped["ExamRound"] = relationship("ExamRound", back_populates="venue_links")
    exam_venue: Mapped["ExamVenue"] = relationship("ExamVenue")
