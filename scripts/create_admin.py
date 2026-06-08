#!/usr/bin/env python3
"""Bootstrap first BO super admin on a fresh production DB.

Usage (Web server, apps/api venv active):
  ADMIN_EMAIL=admin@topik-myanmar.com ADMIN_PASSWORD='...' python3 scripts/create_admin.py

Requires DATABASE_URL (or apps/api/.env). Idempotent — skips if email already exists.
"""
from __future__ import annotations

import asyncio
import os
import sys
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


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


async def main() -> None:
    email = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or ""
    name = (os.environ.get("ADMIN_NAME") or "Super Admin").strip()
    if not email or not password:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD.", file=sys.stderr)
        sys.exit(1)
    if len(password) < 12:
        print("ADMIN_PASSWORD must be at least 12 characters.", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        exists = await db.execute(select(AdminUser).where(AdminUser.email == email))
        if exists.scalar_one_or_none():
            print(f"Admin already exists: {email}")
            await engine.dispose()
            return
        db.add(
            AdminUser(
                email=email,
                password_hash=_hash(password),
                name=name,
                role="super",
            )
        )
        await db.commit()
    await engine.dispose()
    print(f"Created super admin: {email}")


if __name__ == "__main__":
    asyncio.run(main())
