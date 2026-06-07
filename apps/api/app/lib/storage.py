from __future__ import annotations

import base64
import hashlib
import re
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.system import FileAttachment

settings = get_settings()
DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)


def _upload_root() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


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
    key_id = uuid.uuid4().hex
    storage_key = f"local:{key_id}"
    path = _upload_root() / key_id
    path.write_bytes(data)

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
) -> FileAttachment:
    """원시 바이트(멀티파트 업로드)를 파일로 저장하고 FileAttachment 행 반환."""
    if not data:
        raise ValueError("empty_file")
    if len(data) > settings.upload_max_bytes:
        raise ValueError("file_too_large")
    checksum = hashlib.sha256(data).hexdigest()
    key_id = uuid.uuid4().hex
    storage_key = f"local:{key_id}"
    path = _upload_root() / key_id
    path.write_bytes(data)

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
    """로컬 저장 파일의 바이트를 읽음(없으면 None). photos.zip 등에서 사용."""
    path = resolve_local_path(storage_key)
    if not path:
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def resolve_local_path(storage_key: str) -> Path | None:
    if not storage_key.startswith("local:"):
        return None
    path = _upload_root() / storage_key.split(":", 1)[1]
    return path if path.is_file() else None


async def get_file_row(session: AsyncSession, file_id: int) -> FileAttachment | None:
    result = await session.execute(select(FileAttachment).where(FileAttachment.id == file_id))
    return result.scalar_one_or_none()
