"""Exam round / venue capacity guards for FO registration.

Counting policy
---------------
Capacity seats are **people**, not application rows.

- One ``application_submissions`` row = one seat (TOPIK Ⅰ+Ⅱ concurrent
  still consumes a single seat).
- Cancelled submissions (``cancelled_at`` set) do not count.
- Soft-deleted-only leftovers are ignored: a submission counts only when it
  still has at least one non-cancelled, non-deleted application.
- ``capacity == 0`` means unlimited ("미정" in BO sessions UI).

Race safety: callers should ``SELECT … FOR UPDATE`` the exam round (and
venue when checking venue capacity) in the same transaction before counting
and inserting.
"""

from __future__ import annotations

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application, ApplicationSubmission


def _active_app_exists():
    return exists(
        select(Application.id).where(
            Application.submission_id == ApplicationSubmission.id,
            Application.status != "cancelled",
            Application.cancelled_at.is_(None),
            Application.is_deleted.is_(False),
        )
    )


async def count_active_round_submissions(db: AsyncSession, exam_round_id: int) -> int:
    """Active (non-cancelled) submissions that occupy a round seat."""
    stmt = select(func.count()).select_from(ApplicationSubmission).where(
        ApplicationSubmission.exam_round_id == exam_round_id,
        ApplicationSubmission.cancelled_at.is_(None),
        _active_app_exists(),
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def count_active_venue_submissions(
    db: AsyncSession,
    *,
    exam_round_id: int,
    exam_venue_id: int,
) -> int:
    """Active submissions at a venue within a round (people, not level rows)."""
    stmt = select(func.count()).select_from(ApplicationSubmission).where(
        ApplicationSubmission.exam_round_id == exam_round_id,
        ApplicationSubmission.exam_venue_id == exam_venue_id,
        ApplicationSubmission.cancelled_at.is_(None),
        _active_app_exists(),
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def ensure_round_capacity(
    db: AsyncSession,
    *,
    exam_round_id: int,
    capacity: int,
) -> bool:
    """Return True if a new submission may be accepted for the round.

    ``capacity <= 0`` → unlimited. Otherwise require ``active < capacity``.
    """
    if capacity <= 0:
        return True
    active = await count_active_round_submissions(db, exam_round_id)
    return active < capacity


async def ensure_venue_capacity(
    db: AsyncSession,
    *,
    exam_round_id: int,
    exam_venue_id: int,
    capacity: int,
) -> bool:
    """Return True if a new submission may be accepted for the venue.

    ``capacity <= 0`` → unlimited (same convention as round 미정).
    """
    if capacity <= 0:
        return True
    active = await count_active_venue_submissions(
        db, exam_round_id=exam_round_id, exam_venue_id=exam_venue_id
    )
    return active < capacity


def occupancy_snapshot(capacity: int, registered_count: int) -> dict:
    """Public FO fields: registered_count / remaining / is_full.

    ``capacity <= 0`` means unlimited → remaining is null, is_full is False.
    """
    cap = int(capacity or 0)
    registered = int(registered_count or 0)
    if cap <= 0:
        return {
            "registered_count": registered,
            "remaining": None,
            "is_full": False,
        }
    return {
        "registered_count": registered,
        "remaining": max(0, cap - registered),
        "is_full": registered >= cap,
    }
