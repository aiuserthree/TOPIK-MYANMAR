#!/usr/bin/env python3
"""Dev seed: reference data + demo user + admin (requires running PostgreSQL)."""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.models.admin import AdminUser  # noqa: E402
from app.models.exam import CountryRegionCode, ExamRound, ExamRoundVenue, ExamVenue  # noqa: E402
from app.models.user import User  # noqa: E402


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


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

        venue_res = await db.execute(select(ExamVenue).limit(1))
        if not venue_res.scalar_one_or_none():
            venue = ExamVenue(
                venue_code="01",
                name_ko="양곤대 흘라잉캠퍼스",
                name_en="Yangon Univ. Hlaing Campus",
                country_code="025",
                region_code="001",
                capacity=600,
            )
            db.add(venue)
            await db.flush()
            now = datetime.now(timezone.utc)
            rnd = ExamRound(
                round_no=99,
                title="제99회 TOPIK (데모)",
                exam_date=datetime.now(timezone.utc).date(),
                registration_start_at=now - timedelta(days=1),
                registration_end_at=now + timedelta(days=30),
                fee_level_i=50000,
                fee_level_ii=75000,
                capacity=600,
                registration_status="open",
            )
            db.add(rnd)
            await db.flush()
            db.add(ExamRoundVenue(exam_round_id=rnd.id, exam_venue_id=venue.id))

        await db.commit()
    await engine.dispose()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
