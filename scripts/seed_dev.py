#!/usr/bin/env python3
"""Dev seed: reference data + demo user + admin + 제107회 회차 (requires PostgreSQL)."""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.models.admin import AdminUser  # noqa: E402
from app.models.content import FaqItem, Notice, Term  # noqa: E402
from app.models.exam import CountryRegionCode, ExamRound, ExamRoundVenue, ExamVenue  # noqa: E402
from app.models.user import User  # noqa: E402

MM_TZ = ZoneInfo("Asia/Yangon")

# 제107회 — 정책_합의_워크시트 확정값 (시험장은 BO 등록 예정 → seed 미포함)
ROUND_107 = {
    "round_no": 107,
    "title": "제107회",
    "exam_date": datetime(2026, 10, 18, tzinfo=MM_TZ).date(),
    "registration_start_at": datetime(2026, 7, 17, 0, 0, tzinfo=MM_TZ),
    "registration_end_at": datetime(2026, 7, 21, 23, 59, 59, tzinfo=MM_TZ),
    "fee_level_i": 25,
    "fee_level_ii": 25,
    "capacity": 0,
    "registration_status": "open",
}


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


async def _sync_exam_fees(db: AsyncSession) -> None:
    """모든 회차 응시료를 ROUND_107 기준(USD)으로 맞춤 — seed 재실행 시 기존 DB 갱신."""
    fee_i = ROUND_107["fee_level_i"]
    fee_ii = ROUND_107["fee_level_ii"]
    result = await db.execute(select(ExamRound))
    for rnd in result.scalars().all():
        rnd.fee_level_i = fee_i
        rnd.fee_level_ii = fee_ii


async def _ensure_round_107(db: AsyncSession) -> None:
    exists = await db.execute(select(ExamRound).where(ExamRound.round_no == 107))
    if exists.scalar_one_or_none():
        return
    rnd = ExamRound(**ROUND_107)
    db.add(rnd)
    await db.flush()

    notice = Notice(
        category="접수",
        title="제107회 TOPIK 접수 안내",
        body_html="<p>제107회 TOPIK 접수가 시작되었습니다. 접수 기간·응시료·수납 안내는 공지 본문을 확인해 주세요.</p>",
        is_published=True,
        is_pinned=True,
        published_at=datetime.now(timezone.utc),
    )
    db.add(notice)

    for ttype, title, body in (
        ("service", "이용약관 v1.0 (임시)", "<p>이용약관 임시 본문입니다. 고객사 최종 문구 확정 후 교체 예정.</p>"),
        ("privacy", "개인정보처리방침 v1.0 (임시)", "<p>개인정보처리방침 임시 본문입니다.</p>"),
        ("marketing", "마케팅 수신 동의 v1.0 (임시)", "<p>마케팅 정보 수신 동의 안내 임시 본문입니다.</p>"),
    ):
        term_exists = await db.execute(select(Term).where(Term.term_type == ttype, Term.version == "1.0"))
        if not term_exists.scalar_one_or_none():
            db.add(
                Term(
                    term_type=ttype,
                    version="1.0",
                    title=title,
                    body_ko=body,
                    status="published",
                    published_at=datetime.now(timezone.utc),
                )
            )

    faq_exists = await db.execute(select(FaqItem).limit(1))
    if not faq_exists.scalar_one_or_none():
        db.add(
            FaqItem(
                category="접수",
                question_ko="응시료는 어디서 납부하나요?",
                answer_ko="오프라인 수납만 가능합니다. 수납처·계좌·운영시간은 TOPIK 규정 > 응시료 안내 페이지 및 공지사항을 참고해 주세요. (임시 안내 — 고객사 확정 후 갱신)",
                sort_order=1,
                is_active=True,
            )
        )


async def main() -> None:
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://topik_app:change_me@127.0.0.1:5432/topik_myanmar",
    )
    engine = create_async_engine(url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    regions = [
        ("025", "001", "양곤", "Yangon"),
        ("025", "002", "만달레이", "Mandalay"),
        ("025", "003", "네피도", "Naypyidaw"),
        ("025", "004", "몽유와", "Monywa"),
    ]

    async with Session() as db:
        for cc, rc, ko, en in regions:
            exists = await db.execute(
                select(CountryRegionCode).where(
                    CountryRegionCode.country_code == cc,
                    CountryRegionCode.region_code == rc,
                )
            )
            if not exists.scalar_one_or_none():
                db.add(CountryRegionCode(country_code=cc, region_code=rc, name_ko=ko, name_en=en))

        user_res = await db.execute(select(User).where(User.email == "demo@topik-mm.local"))
        if not user_res.scalar_one_or_none():
            db.add(
                User(
                    email="demo@topik-mm.local",
                    password_hash=_hash("DemoUser!2026"),
                    name_ko="데모사용자",
                    name_en="Demo User",
                    birth_date="19900101",
                    gender="1",
                    nationality="미얀마",
                    first_language="미얀마어",
                    phone="09123456789",
                    job_code=1,
                    motive_code=1,
                    purpose_code=1,
                    marketing_opt_in=True,
                    password_changed_at=datetime.now(timezone.utc) - timedelta(days=200),
                )
            )

        admin_res = await db.execute(select(AdminUser).where(AdminUser.email == "admin-dev@topik-mm.local"))
        if not admin_res.scalar_one_or_none():
            db.add(
                AdminUser(
                    email="admin-dev@topik-mm.local",
                    password_hash=_hash("DevOnly!2026"),
                    name="Dev Admin",
                    role="super",
                )
            )

        await _ensure_round_107(db)
        await _sync_exam_fees(db)

        # 레거시 데모 회차(99회) — 기존 DB 호환용, 신규에는 107회만 생성
        old99 = await db.execute(select(ExamRound).where(ExamRound.round_no == 99))
        if not old99.scalar_one_or_none():
            pass  # 99회 자동 생성 안 함 — 107회가 기준

        await db.commit()
    await engine.dispose()
    print("Seed complete (제107회 + regions + demo accounts).")


if __name__ == "__main__":
    asyncio.run(main())
