"""Exam round / venue capacity guards for FO registration.

Counting policy
---------------
Two independent limits apply, both with ``0 == unlimited`` ("미정" in BO):

1. **Total capacity** (``capacity``) — seats are **people**, not application
   rows. One ``application_submissions`` row = one seat (TOPIK Ⅰ+Ⅱ concurrent
   still consumes a single seat).
2. **Per-level capacity** (``capacity_level_i`` / ``capacity_level_ii``) —
   seats are **level application rows**. A Ⅰ+Ⅱ concurrent applicant consumes
   one Ⅰ seat *and* one Ⅱ seat, because they sit two different exams.

Both ignore cancelled/soft-deleted rows:

- Cancelled submissions (``cancelled_at`` set) do not count.
- Soft-deleted-only leftovers are ignored: a submission counts only when it
  still has at least one non-cancelled, non-deleted application.
- A rejected (반려) level row still holds its level seat — 재신청은 같은 행을
  되살리므로 새 좌석을 쓰지 않는다.

Race safety: callers should ``SELECT … FOR UPDATE`` the exam round (and
venue when checking venue capacity) in the same transaction before counting
and inserting.
"""

from __future__ import annotations

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application, ApplicationSubmission

LEVELS = ("I", "II")


def _active_app_exists():
    return exists(
        select(Application.id).where(
            Application.submission_id == ApplicationSubmission.id,
            Application.status != "cancelled",
            Application.cancelled_at.is_(None),
            Application.is_deleted.is_(False),
        )
    )


def _level_seat_select(*columns):
    """Select over level rows that occupy a per-level seat (submission active)."""
    return (
        select(*columns)
        .select_from(Application)
        .join(ApplicationSubmission, Application.submission_id == ApplicationSubmission.id)
        .where(
            ApplicationSubmission.cancelled_at.is_(None),
            Application.status != "cancelled",
            Application.cancelled_at.is_(None),
            Application.is_deleted.is_(False),
        )
    )


def normalize_level(level: str | None) -> str:
    lv = (level or "").strip().upper()
    return lv if lv in LEVELS else ""


def level_capacity(row, level: str) -> int:
    """``capacity_level_i`` / ``capacity_level_ii`` of a round or venue row."""
    if normalize_level(level) == "II":
        return int(getattr(row, "capacity_level_ii", 0) or 0)
    return int(getattr(row, "capacity_level_i", 0) or 0)


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


async def count_active_round_level_applications(
    db: AsyncSession,
    *,
    exam_round_id: int,
    level: str,
) -> int:
    """Active TOPIK Ⅰ/Ⅱ rows in a round (level seats, not people)."""
    stmt = _level_seat_select(func.count()).where(
        Application.exam_round_id == exam_round_id,
        Application.exam_level == normalize_level(level),
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def count_active_venue_level_applications(
    db: AsyncSession,
    *,
    exam_round_id: int,
    exam_venue_id: int,
    level: str,
) -> int:
    """Active TOPIK Ⅰ/Ⅱ rows at a venue within a round."""
    stmt = _level_seat_select(func.count()).where(
        Application.exam_round_id == exam_round_id,
        Application.exam_venue_id == exam_venue_id,
        Application.exam_level == normalize_level(level),
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def round_level_counts(db: AsyncSession, exam_round_id: int) -> dict[str, int]:
    """``{"I": n, "II": n}`` for a round — one grouped query."""
    stmt = (
        _level_seat_select(Application.exam_level, func.count())
        .where(Application.exam_round_id == exam_round_id)
        .group_by(Application.exam_level)
    )
    counts = {lv: 0 for lv in LEVELS}
    for level, total in (await db.execute(stmt)).all():
        lv = normalize_level(level)
        if lv:
            counts[lv] = int(total or 0)
    return counts


async def venue_level_counts(
    db: AsyncSession, exam_round_id: int
) -> dict[int, dict[str, int]]:
    """``{venue_id: {"I": n, "II": n}}`` for a round — one grouped query."""
    stmt = (
        _level_seat_select(
            Application.exam_venue_id, Application.exam_level, func.count()
        )
        .where(Application.exam_round_id == exam_round_id)
        .group_by(Application.exam_venue_id, Application.exam_level)
    )
    counts: dict[int, dict[str, int]] = {}
    for venue_id, level, total in (await db.execute(stmt)).all():
        lv = normalize_level(level)
        if not lv:
            continue
        counts.setdefault(int(venue_id), {lv2: 0 for lv2 in LEVELS})[lv] = int(total or 0)
    return counts


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


async def ensure_round_level_capacity(
    db: AsyncSession,
    *,
    exam_round_id: int,
    level: str,
    capacity: int,
) -> bool:
    """Return True if the round can still take one more seat of ``level``."""
    if capacity <= 0:
        return True
    active = await count_active_round_level_applications(
        db, exam_round_id=exam_round_id, level=level
    )
    return active < capacity


async def ensure_venue_level_capacity(
    db: AsyncSession,
    *,
    exam_round_id: int,
    exam_venue_id: int,
    level: str,
    capacity: int,
) -> bool:
    """Return True if the venue can still take one more seat of ``level``."""
    if capacity <= 0:
        return True
    active = await count_active_venue_level_applications(
        db, exam_round_id=exam_round_id, exam_venue_id=exam_venue_id, level=level
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


def level_occupancy_snapshot(row, counts: dict[str, int] | None) -> dict:
    """``{"I": {...}, "II": {...}}`` occupancy for a round or venue row."""
    counts = counts or {}
    snapshot = {}
    for lv in LEVELS:
        cap = level_capacity(row, lv)
        data = {"capacity": cap}
        data.update(occupancy_snapshot(cap, counts.get(lv, 0)))
        snapshot[lv] = data
    return snapshot
