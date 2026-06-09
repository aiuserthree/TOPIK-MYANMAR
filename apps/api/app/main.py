import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.lib.env_validate import validate_runtime_settings
from app.lib.email_worker import email_worker_loop
from app.lib.mail import schedule_queued_outbox_deliveries
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
    validate_runtime_settings()
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


class OutboxDeliveryMiddleware(BaseHTTPMiddleware):
    """DB commit 후 enqueue 된 transactional mail 을 백그라운드 발송."""

    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        finally:
            schedule_queued_outbox_deliveries()


app.add_middleware(OutboxDeliveryMiddleware)


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    """FO/BO 클라이언트가 기대하는 최상위 `error` 모양으로 통일.

    api_error()는 detail={"error": {...}} 를 사용하므로 그대로 최상위로 노출.
    그 외 문자열 detail 은 표준 코드로 감싼다.
    """
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        body = detail
    else:
        body = {"error": {"code": "HTTP_ERROR", "message": detail if isinstance(detail, str) else "요청을 처리할 수 없습니다."}}
    return JSONResponse(status_code=exc.status_code, content=body, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "입력값이 올바르지 않습니다.",
                "details": jsonable_encoder(exc.errors()),
            }
        },
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Uncaught errors → JSON 500 so CORS middleware can attach headers."""
    message = str(exc) if settings.is_development else "서버 오류가 발생했습니다."
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": message}},
    )


@app.exception_handler(IntegrityError)
async def _integrity_exception_handler(request: Request, exc: IntegrityError):
    """Unhandled unique/FK violations → JSON 409/400 (CORS-safe) instead of bare 500."""
    msg = str(exc.orig) if exc.orig else str(exc)
    if "application_submissions_user_id_exam_round_id" in msg:
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "ALREADY_SUBMITTED",
                    "message": "이미 해당 회차에 접수한 내역이 있습니다.",
                }
            },
        )
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "CONFLICT", "message": "요청이 기존 데이터와 충돌합니다."}},
    )


app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(exam.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(content.router, prefix="/api/v1")
app.include_router(board.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(admin_api.router, prefix="/api/v1")
