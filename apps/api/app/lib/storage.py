from __future__ import annotations

import base64
import hashlib
import logging
import re
import uuid
from functools import lru_cache
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.system import FileAttachment

settings = get_settings()
logger = logging.getLogger(__name__)
DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)


def _upload_root() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _missing_s3_settings() -> list[str]:
    required = {
        "S3_BUCKET": settings.s3_bucket,
        "S3_ACCESS_KEY": settings.s3_access_key,
        "S3_SECRET": settings.s3_secret,
    }
    return [name for name, value in required.items() if not value]


def validate_storage_settings() -> None:
    """Fail fast when production S3 is selected but required credentials are absent."""
    if settings.storage_provider.lower() != "s3":
        return
    missing = _missing_s3_settings()
    if missing:
        raise RuntimeError(
            "STORAGE_PROVIDER=s3 requires " + ", ".join(missing) + "; refusing local fallback"
        )


def _effective_provider() -> str:
    if settings.storage_provider.lower() != "s3":
        return "local"
    validate_storage_settings()
    return "s3"


def _s3_object_key(category: str, file_id: str) -> str:
    prefix = (settings.s3_prefix or "").strip("/")
    parts = [part for part in (prefix, category, file_id) if part]
    return "/".join(parts)


def _make_s3_storage_key(bucket: str, object_key: str) -> str:
    return f"s3:{bucket}/{object_key}"


def parse_s3_storage_key(storage_key: str) -> tuple[str, str] | None:
    if not storage_key.startswith("s3:"):
        return None
    rest = storage_key[3:]
    bucket, sep, key = rest.partition("/")
    if not sep or not bucket or not key:
        return None
    return bucket, key


def _s3_client_config():
    from botocore.config import Config

    # boto3 1.36+ defaults checksum on every PutObject; IwinV 등 S3 호환 스토리지는
    # MissingContentLength 로 실패할 수 있음 → when_required 로 완화.
    base = Config(
        signature_version="s3v4",
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )
    endpoint = (settings.s3_endpoint or "").lower()
    # Optional local MinIO only — IwinV (kr.object.iwinv.kr) uses default virtual-hosted style.
    if endpoint and not endpoint.startswith("https://kr.object.iwinv.kr"):
        if any(token in endpoint for token in ("localhost", "127.0.0.1", "minio")):
            return Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            )
    return base


@lru_cache
def _get_s3_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret,
        config=_s3_client_config(),
    )


def _write_local(*, data: bytes, file_id: str) -> str:
    storage_key = f"local:{file_id}"
    path = _upload_root() / file_id
    path.write_bytes(data)
    return storage_key


def _s3_error_message(exc: ClientError) -> str:
    code = exc.response.get("Error", {}).get("Code", "")
    if code in {"InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied"}:
        return "파일 저장소(S3) 인증에 실패했습니다. S3_ACCESS_KEY·S3_SECRET을 확인해 주세요."
    return "파일 저장소(S3)에 업로드할 수 없습니다. S3 설정을 확인해 주세요."


def _write_bytes(*, data: bytes, mime_type: str, category: str) -> str:
    file_id = uuid.uuid4().hex
    if _effective_provider() == "s3":
        bucket = settings.s3_bucket
        object_key = _s3_object_key(category, file_id)
        client = _get_s3_client()
        try:
            client.put_object(
                Bucket=bucket,
                Key=object_key,
                Body=data,
                ContentType=mime_type,
                ContentLength=len(data),
            )
        except ClientError as exc:
            err_code = exc.response.get("Error", {}).get("Code", "unknown")
            logger.warning("S3 put_object failed: %s bucket=%s key=%s", err_code, bucket, object_key)
            if settings.is_development:
                logger.warning(
                    "S3 upload failed (%s); using local storage for development",
                    err_code,
                )
                return _write_local(data=data, file_id=file_id)
            raise ValueError(_s3_error_message(exc)) from exc
        except BotoCoreError as exc:
            if settings.is_development:
                logger.warning("S3 upload failed; using local storage for development: %s", exc)
                return _write_local(data=data, file_id=file_id)
            raise ValueError("파일 저장소(S3)에 연결할 수 없습니다.") from exc
        return _make_s3_storage_key(bucket, object_key)

    return _write_local(data=data, file_id=file_id)


def decode_photo_base64(photo_base64: str) -> tuple[bytes, str]:
    raw = (photo_base64 or "").strip()
    mime = "image/jpeg"
    if raw.startswith("data:"):
        match = DATA_URL_RE.match(raw)
        if not match:
            raise ValueError("invalid_data_url")
        mime = match.group(1)
        raw = match.group(2)
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception as exc:
        raise ValueError("invalid_base64") from exc
    if not data:
        raise ValueError("empty_image")
    if len(data) > settings.upload_max_bytes:
        raise ValueError("file_too_large")
    return data, mime


async def save_photo(
    session: AsyncSession,
    *,
    owner_type: str,
    owner_id: int,
    photo_base64: str,
    original_filename: str | None = None,
) -> FileAttachment:
    data, mime = decode_photo_base64(photo_base64)
    checksum = hashlib.sha256(data).hexdigest()
    storage_key = _write_bytes(data=data, mime_type=mime, category="photos")

    row = FileAttachment(
        owner_type=owner_type,
        owner_id=owner_id,
        storage_key=storage_key,
        original_filename=original_filename or "photo.jpg",
        mime_type=mime,
        size_bytes=len(data),
        checksum_sha256=checksum,
    )
    session.add(row)
    await session.flush()
    return row


async def save_upload(
    session: AsyncSession,
    *,
    owner_type: str,
    owner_id: int,
    data: bytes,
    mime_type: str,
    original_filename: str | None = None,
    max_bytes: int | None = None,
) -> FileAttachment:
    """원시 바이트(멀티파트 업로드)를 파일로 저장하고 FileAttachment 행 반환."""
    if not data:
        raise ValueError("empty_file")
    limit = max_bytes if max_bytes is not None else settings.upload_max_bytes
    if len(data) > limit:
        raise ValueError("file_too_large")
    checksum = hashlib.sha256(data).hexdigest()
    storage_key = _write_bytes(data=data, mime_type=mime_type, category="uploads")

    row = FileAttachment(
        owner_type=owner_type,
        owner_id=owner_id,
        storage_key=storage_key,
        original_filename=original_filename or "file",
        mime_type=mime_type,
        size_bytes=len(data),
        checksum_sha256=checksum,
    )
    session.add(row)
    await session.flush()
    return row


def read_file_bytes(storage_key: str) -> bytes | None:
    """저장소(local/S3)에서 파일 바이트를 읽음(없으면 None). photos.zip 등에서 사용."""
    if storage_key.startswith("local:"):
        path = resolve_local_path(storage_key)
        if not path:
            return None
        try:
            return path.read_bytes()
        except OSError:
            return None

    parsed = parse_s3_storage_key(storage_key)
    if not parsed:
        return None
    bucket, key = parsed
    try:
        response = _get_s3_client().get_object(Bucket=bucket, Key=key)
        return response["Body"].read()
    except (ClientError, BotoCoreError) as exc:
        logger.debug("S3 read failed for %s: %s", storage_key, exc)
        return None


def delete_file(storage_key: str) -> bool:
    """저장소(local/S3)에서 파일 삭제. 성공 시 True."""
    if storage_key.startswith("local:"):
        path = resolve_local_path(storage_key)
        if not path:
            return False
        try:
            path.unlink()
            return True
        except OSError:
            return False

    parsed = parse_s3_storage_key(storage_key)
    if not parsed:
        return False
    bucket, key = parsed
    try:
        _get_s3_client().delete_object(Bucket=bucket, Key=key)
        return True
    except (ClientError, BotoCoreError) as exc:
        logger.debug("S3 delete failed for %s: %s", storage_key, exc)
        return False


def resolve_local_path(storage_key: str) -> Path | None:
    if not storage_key.startswith("local:"):
        return None
    path = _upload_root() / storage_key.split(":", 1)[1]
    return path if path.is_file() else None


async def get_file_row(session: AsyncSession, file_id: int) -> FileAttachment | None:
    result = await session.execute(select(FileAttachment).where(FileAttachment.id == file_id))
    return result.scalar_one_or_none()
