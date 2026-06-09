#!/usr/bin/env python3
"""S3 연결·업로드 스모크 테스트 — apps/api/.env 의 STORAGE_PROVIDER / S3_* 사용."""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from app.config import get_settings  # noqa: E402
from app.lib.storage import _get_s3_client, _missing_s3_settings, _s3_object_key  # noqa: E402


def _mask(value: str) -> str:
    v = (value or "").strip()
    if len(v) <= 4:
        return "(empty)" if not v else "****"
    return f"{v[:4]}…{v[-2:]} (len={len(v)})"


def main() -> int:
    parser = argparse.ArgumentParser(description="S3 smoke test for configured object storage")
    parser.add_argument("--dry-run", action="store_true", help="설정만 출력하고 업로드하지 않음")
    args = parser.parse_args()

    settings = get_settings()
    print(f"APP_ENV={settings.app_env}")
    print(f"STORAGE_PROVIDER={settings.storage_provider}")
    print(f"S3_BUCKET={settings.s3_bucket or '(empty)'}")
    print(f"S3_REGION={settings.s3_region}")
    print(f"S3_ENDPOINT={settings.s3_endpoint}")
    print(f"S3_PREFIX={settings.s3_prefix}")
    print(f"S3_ACCESS_KEY={_mask(settings.s3_access_key)}")
    print(f"S3_SECRET={_mask(settings.s3_secret)}")

    if settings.storage_provider.lower() != "s3":
        print("STORAGE_PROVIDER가 s3가 아닙니다.", file=sys.stderr)
        return 1

    missing = _missing_s3_settings()
    if missing:
        print("누락된 설정: " + ", ".join(missing), file=sys.stderr)
        return 1

    if args.dry_run:
        print("dry-run: 업로드 생략")
        return 0

    client = _get_s3_client()
    file_id = uuid.uuid4().hex
    key = _s3_object_key("photos", file_id)
    body = b"topik-s3-smoke-test"

    try:
        client.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=body,
            ContentType="text/plain",
            ContentLength=len(body),
        )
        client.delete_object(Bucket=settings.s3_bucket, Key=key)
    except Exception as exc:
        code = ""
        if hasattr(exc, "response"):
            code = exc.response.get("Error", {}).get("Code", "")
        print(f"S3 업로드 실패: {code or type(exc).__name__}: {exc}", file=sys.stderr)
        if code in {"InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied"}:
            print(
                "→ IwinV 콘솔 인증키(S3_ACCESS_KEY / S3_SECRET)와 버킷 권한을 확인하세요.",
                file=sys.stderr,
            )
        return 1

    print(f"ok: s3://{settings.s3_bucket}/{key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
