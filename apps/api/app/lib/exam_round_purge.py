"""회차(exam_round) 및 연관 접수 데이터 완전 삭제 — round_no 재사용 허용."""

from __future__ import annotations

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application, ApplicationMemo, ApplicationSubmission
from app.models.exam import ExamRound


async def purge_exam_round(db: AsyncSession, round_id: int) -> dict:
    """회차의 접수·제출·메모를 삭제하고 회차 행을 제거합니다."""
    rnd = (await db.execute(select(ExamRound).where(ExamRound.id == round_id))).scalar_one_or_none()
    if not rnd:
        return {"round_no": None, "applications_deleted": 0, "submissions_deleted": 0}

    round_no = rnd.round_no
    app_ids = (
        await db.execute(select(Application.id).where(Application.exam_round_id == round_id))
    ).scalars().all()

    if app_ids:
        await db.execute(
            update(Application)
            .where(Application.exam_round_id == round_id)
            .values(photo_file_id=None)
        )
        await db.execute(delete(ApplicationMemo).where(ApplicationMemo.application_id.in_(app_ids)))
        await db.execute(delete(Application).where(Application.exam_round_id == round_id))

    sub_count = (
        await db.execute(
            delete(ApplicationSubmission).where(ApplicationSubmission.exam_round_id == round_id)
        )
    ).rowcount or 0

    await db.execute(delete(ExamRound).where(ExamRound.id == round_id))

    return {
        "round_no": round_no,
        "applications_deleted": len(app_ids),
        "submissions_deleted": sub_count,
    }
