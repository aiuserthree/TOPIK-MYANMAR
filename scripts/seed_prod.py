#!/usr/bin/env python3
"""Production seed: regions + 제107회 + 약관/FAQ/공지 (NO demo FO/BO accounts).

Usage:
  CONFIRM_PROD_SEED=1 python3 scripts/seed_prod.py

Never run scripts/seed_dev.py on production — it creates demo@topik-mm.local / admin-dev@topik-mm.local.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
sys.path.insert(0, str(ROOT / "scripts"))

from app.models.exam import CountryRegionCode  # noqa: E402
from seed_dev import _ensure_round_107  # noqa: E402


async def main() -> None:
    if os.environ.get("CONFIRM_PROD_SEED") != "1":
        print("Refusing to run without CONFIRM_PROD_SEED=1", file=sys.stderr)
        sys.exit(1)

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

        await _ensure_round_107(db)
        await db.commit()

    await engine.dispose()
    print("Production seed complete (regions + 제107회; no demo accounts).")


if __name__ == "__main__":
    asyncio.run(main())
