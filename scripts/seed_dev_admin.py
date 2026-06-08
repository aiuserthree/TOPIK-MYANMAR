#!/usr/bin/env python3
"""Upsert local dev BO admin on production (admin-dev@topik-mm.local).

Usage (Web server, apps/api venv active):
  python3 scripts/seed_dev_admin.py

Creates the account or resets password to match seed_dev.py / 로컬 서버 확인.txt.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))
os.chdir(API_DIR)

from app.config import get_settings  # noqa: E402
from app.models.admin import AdminUser  # noqa: E402

DEV_ADMIN_EMAIL = "admin-dev@topik-mm.local"
DEV_ADMIN_PASSWORD = "DevOnly!2026"
DEV_ADMIN_NAME = "Dev Admin"


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


async def main() -> None:
    url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    now = datetime.now(timezone.utc)
    pw_hash = _hash(DEV_ADMIN_PASSWORD)

    async with Session() as db:
        row = (
            await db.execute(select(AdminUser).where(AdminUser.email == DEV_ADMIN_EMAIL))
        ).scalar_one_or_none()
        if row:
            row.password_hash = pw_hash
            row.name = DEV_ADMIN_NAME
            row.role = "super"
            row.status = "active"
            row.must_change_password = False
            row.failed_login_count = 0
            row.login_locked_until = None
            row.password_changed_at = now
            await db.commit()
            print(f"Reset dev admin password: {DEV_ADMIN_EMAIL}")
        else:
            db.add(
                AdminUser(
                    email=DEV_ADMIN_EMAIL,
                    password_hash=pw_hash,
                    name=DEV_ADMIN_NAME,
                    role="super",
                    status="active",
                    must_change_password=False,
                    password_changed_at=now,
                )
            )
            await db.commit()
            print(f"Created dev admin: {DEV_ADMIN_EMAIL}")

    await engine.dispose()
    print("Login: admin-dev@topik-mm.local / DevOnly!2026")


if __name__ == "__main__":
    asyncio.run(main())
