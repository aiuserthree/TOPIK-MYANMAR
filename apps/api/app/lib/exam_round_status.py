from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import ExamRound


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def derive_registration_status(
    *,
    registration_start_at: datetime,
    registration_end_at: datetime,
    current: str,
    now: datetime | None = None,
) -> str:
    """접수기간 기준 자동 상태. revoked 는 관리자 폐지로만 유지."""
    if current == "revoked":
        return "revoked"
    now = _aware(now or datetime.now(timezone.utc))
    start = _aware(registration_start_at)
    end = _aware(registration_end_at)
    if now < start:
        return "scheduled"
    if now <= end:
        return "open"
    return "closed"


async def sync_exam_round_status(
    db: AsyncSession,
    rnd: ExamRound,
    *,
    now: datetime | None = None,
) -> bool:
    """DB registration_status 를 접수기간에 맞게 갱신. 변경 시 True."""
    new = derive_registration_status(
        registration_start_at=rnd.registration_start_at,
        registration_end_at=rnd.registration_end_at,
        current=rnd.registration_status,
        now=now,
    )
    if rnd.registration_status == new:
        return False
    rnd.registration_status = new
    await db.flush()
    return True


async def sync_exam_rounds_status(db: AsyncSession, rounds: list[ExamRound]) -> bool:
    """목록 조회 시 일괄 동기화. 하나라도 바뀌면 True."""
    changed = False
    for rnd in rounds:
        if await sync_exam_round_status(db, rnd):
            changed = True
    if changed:
        await db.commit()
    return changed
