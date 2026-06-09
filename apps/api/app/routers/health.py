from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db_session
from app.lib.mail import is_mailer_live

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/mail")
async def health_mail() -> dict[str, str | bool]:
    cfg = get_settings()
    return {
        "status": "ok",
        "mail_provider": cfg.mail_provider,
        "mailer_live": is_mailer_live(cfg),
        "email_worker": cfg.enable_email_worker,
    }


@router.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db_session)) -> dict[str, str | bool]:
    await db.execute(text("SELECT 1"))
    pgvector = bool(
        (await db.execute(text("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"))).scalar()
    )
    return {"status": "ok", "database": "connected", "pgvector": pgvector}
