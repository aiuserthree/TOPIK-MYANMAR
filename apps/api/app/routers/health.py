from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db_session)) -> dict[str, str | bool]:
    await db.execute(text("SELECT 1"))
    pgvector = bool(
        (await db.execute(text("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"))).scalar()
    )
    return {"status": "ok", "database": "connected", "pgvector": pgvector}
