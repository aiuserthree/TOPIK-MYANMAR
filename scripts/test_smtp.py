#!/usr/bin/env python3
"""SMTP 연결·발송 스모크 테스트 — apps/api/.env 의 MAIL_* / SMTP_* 사용."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from app.config import get_settings  # noqa: E402
from app.lib.mail import RenderedEmail, send_email  # noqa: E402
from app.lib.email_render import render_signup_verify_code  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="IwinV SMTP smoke test")
    parser.add_argument("--to", required=True, help="수신 테스트 이메일")
    parser.add_argument("--dry-run", action="store_true", help="설정만 출력하고 발송하지 않음")
    args = parser.parse_args()

    settings = get_settings()
    print(f"MAIL_PROVIDER={settings.mail_provider}")
    print(f"SMTP_HOST={settings.smtp_host}:{settings.smtp_port} secure={settings.smtp_secure}")
    print(f"MAIL_FROM={settings.mail_from}")

    if settings.mail_provider.lower() != "smtp":
        print("MAIL_PROVIDER가 smtp가 아닙니다. apps/api/.env 를 확인하세요.", file=sys.stderr)
        return 1
    if not settings.smtp_user or not settings.smtp_pass:
        print("SMTP_USER / SMTP_PASS 가 비어 있습니다.", file=sys.stderr)
        return 1

    subject, text, html = render_signup_verify_code(
        "ko",
        {"userName": "SMTP Test", "verificationCode": "123 456", "expiresMinutes": "5"},
        settings.public_fo_base,
    )
    rendered = RenderedEmail(subject=f"[SMTP TEST] {subject}", text=text, html=html)

    if args.dry_run:
        print("dry-run: 발송 생략")
        return 0

    send_email(args.to, rendered, settings)
    print(f"sent to {args.to}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
