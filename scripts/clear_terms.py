#!/usr/bin/env python3
"""Delete all terms (and related consent rows) for a fresh BO registration.

Usage (apps/api venv active):
  python3 scripts/clear_terms.py
  python3 scripts/clear_terms.py --keep-consents   # terms only; consents keep term_id=NULL

Requires DATABASE_URL (or apps/api/.env). Dev DB default matches seed_dev.py.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.models.content import Term, TermConsent  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Clear terms data for fresh BO registration.")
    parser.add_argument(
        "--keep-consents",
        action="store_true",
        help="Keep terms_consents rows (term_id becomes NULL after terms delete).",
    )
    args = parser.parse_args()

    url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://topik_app:change_me@127.0.0.1:5432/topik_myanmar",
    )
    engine = create_async_engine(url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        term_count = (await db.execute(select(func.count()).select_from(Term))).scalar_one()
        consent_count = (await db.execute(select(func.count()).select_from(TermConsent))).scalar_one()

        if term_count == 0 and consent_count == 0:
            print("Nothing to clear — terms and terms_consents are already empty.")
            return

        print(f"Before: terms={term_count}, terms_consents={consent_count}")

        if not args.keep_consents and consent_count:
            await db.execute(delete(TermConsent))
            print(f"Deleted {consent_count} row(s) from terms_consents.")

        if term_count:
            await db.execute(delete(Term))
            print(f"Deleted {term_count} row(s) from terms.")

        await db.commit()

    # V007 optional — separate transaction; a missing table must not abort terms delete
    async with Session() as chunk_db:
        try:
            chunk_res = await chunk_db.execute(
                text("DELETE FROM semantic_chunks WHERE source_type = 'terms' RETURNING id")
            )
            chunk_ids = chunk_res.scalars().all()
            if chunk_ids:
                print(f"Deleted {len(chunk_ids)} semantic_chunks row(s) for terms.")
            await chunk_db.commit()
        except Exception:
            await chunk_db.rollback()

    async with Session() as verify_db:
        left_terms = (await verify_db.execute(select(func.count()).select_from(Term))).scalar_one()
        left_consents = (await verify_db.execute(select(func.count()).select_from(TermConsent))).scalar_one()
        print(f"After: terms={left_terms}, terms_consents={left_consents}")
        print("Done. Register new terms from BO → 약관 관리.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
