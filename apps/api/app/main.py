import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.lib.email_worker import email_worker_loop
from app.routers import (
    admin_api,
    applications,
    auth,
    board,
    content,
    exam,
    files,
    health,
    me,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task: asyncio.Task | None = None
    if settings.enable_email_worker:
        worker_task = asyncio.create_task(email_worker_loop())
    yield
    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="TOPIK Myanmar API",
    version="1.0.0",
    description="FastAPI backend for TOPIK Myanmar FO/BO (IwinV production).",
    lifespan=lifespan,
)

_cors_kwargs: dict = {
    "allow_origins": settings.cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.cors_allow_localhost:
    _cors_kwargs["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(exam.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(content.router, prefix="/api/v1")
app.include_router(board.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(admin_api.router, prefix="/api/v1")
