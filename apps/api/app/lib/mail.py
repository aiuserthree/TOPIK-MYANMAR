from __future__ import annotations

import json
import logging
import smtplib
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.lib.email_render import render_password_reset, render_signup_verify_code
from app.models.system import EmailOutbox

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
RETRY_DELAYS_SECONDS = (30, 120, 600, 1800, 3600)


@dataclass
class RenderedEmail:
    subject: str
    text: str
    html: str


def format_verification_code(code: str) -> str:
    digits = "".join(ch for ch in code if ch.isdigit())
    if len(digits) == 6:
        return f"{digits[:3]} {digits[3:]}"
    return code


def is_mailer_live(settings: Settings | None = None) -> bool:
    cfg = settings or get_settings()
    provider = cfg.mail_provider.lower()
    if provider == "console":
        return False
    if provider == "smtp":
        return bool(cfg.smtp_host and cfg.smtp_user and cfg.smtp_pass)
    if provider == "resend":
        return bool(cfg.resend_api_key)
    return False


def _locale_label(locale: str) -> str:
    return {"ko": "ko", "my": "my", "en": "en"}.get(locale[:2].lower(), "ko")


def render_template(
    template_key: str,
    locale: str,
    variables: dict,
    settings: Settings | None = None,
) -> RenderedEmail:
    cfg = settings or get_settings()
    lang = _locale_label(locale)

    if template_key == "signup_verify_code":
        subject, text, html = render_signup_verify_code(lang, variables, cfg.public_fo_base)
        return RenderedEmail(subject=subject, text=text, html=html)

    if template_key == "password_reset":
        subject, text, html = render_password_reset(lang, variables, cfg.public_fo_base)
        return RenderedEmail(subject=subject, text=text, html=html)

    subject = f"[TOPIK Myanmar] {template_key}"
    text = json.dumps(variables, ensure_ascii=False, indent=2)
    return RenderedEmail(subject=subject, text=text, html=f"<pre>{text}</pre>")


def _send_console(to_email: str, rendered: RenderedEmail, settings: Settings) -> None:
    logger.info(
        "MAIL(console) to=%s from=%s subject=%s\n%s",
        to_email,
        settings.mail_from,
        rendered.subject,
        rendered.text,
    )


def _send_smtp(to_email: str, rendered: RenderedEmail, settings: Settings) -> None:
    envelope_from = parseaddr(settings.mail_from)[1] or settings.mail_from
    msg = MIMEMultipart("alternative")
    msg["Subject"] = rendered.subject
    msg["From"] = settings.mail_from
    msg["To"] = to_email
    msg.attach(MIMEText(rendered.text, "plain", "utf-8"))
    msg.attach(MIMEText(rendered.html, "html", "utf-8"))

    if settings.smtp_secure:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context) as smtp:
            smtp.login(settings.smtp_user, settings.smtp_pass)
            smtp.sendmail(envelope_from, [to_email], msg.as_string())
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(settings.smtp_user, settings.smtp_pass)
        smtp.sendmail(envelope_from, [to_email], msg.as_string())


def _send_resend(to_email: str, rendered: RenderedEmail, settings: Settings) -> None:
    payload = json.dumps(
        {
            "from": settings.mail_from,
            "to": [to_email],
            "subject": rendered.subject,
            "html": rendered.html,
            "text": rendered.text,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Resend HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend HTTP {exc.code}: {body}") from exc


def send_email(to_email: str, rendered: RenderedEmail, settings: Settings | None = None) -> bool:
    cfg = settings or get_settings()
    provider = cfg.mail_provider.lower()
    if provider == "console":
        _send_console(to_email, rendered, cfg)
        return False
    if provider == "smtp":
        _send_smtp(to_email, rendered, cfg)
        return True
    if provider == "resend":
        _send_resend(to_email, rendered, cfg)
        return True
    raise ValueError(f"Unsupported MAIL_PROVIDER: {cfg.mail_provider}")


async def enqueue_email(
    db: AsyncSession,
    *,
    template_key: str,
    to_email: str,
    locale: str = "ko",
    user_id: int | None = None,
    variables: dict | None = None,
    settings: Settings | None = None,
) -> dict:
    cfg = settings or get_settings()
    row = EmailOutbox(
        template_key=template_key,
        to_email=to_email.strip().lower(),
        user_id=user_id,
        locale=locale[:5] if locale else "ko",
        variables=variables or {},
        status="queued",
    )
    db.add(row)
    await db.flush()

    if not cfg.enable_email_worker:
        sent = await deliver_outbox_row(db, row, cfg)
        return {"queued_id": row.id, "sent": sent, "status": row.status}

    return {"queued_id": row.id, "sent": False, "status": row.status}


async def deliver_outbox_row(db: AsyncSession, row: EmailOutbox, settings: Settings) -> bool:
    rendered = render_template(row.template_key, row.locale, row.variables, settings)
    now = datetime.now(timezone.utc)
    try:
        sent = send_email(row.to_email, rendered, settings)
        row.status = "sent"
        row.sent_at = now
        row.last_error = None
        row.next_retry_at = None
        row.updated_at = now
        return sent
    except Exception as exc:
        row.retry_count += 1
        row.last_error = str(exc)[:2000]
        row.updated_at = now
        if row.retry_count >= MAX_RETRIES:
            row.status = "failed"
            row.next_retry_at = None
        else:
            row.status = "queued"
            delay = RETRY_DELAYS_SECONDS[min(row.retry_count - 1, len(RETRY_DELAYS_SECONDS) - 1)]
            row.next_retry_at = now + timedelta(seconds=delay)
        logger.exception("email_outbox send failed id=%s template=%s", row.id, row.template_key)
        return False


async def process_outbox_batch(db: AsyncSession, *, limit: int = 25, settings: Settings | None = None) -> int:
    cfg = settings or get_settings()
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(EmailOutbox)
        .where(
            EmailOutbox.status == "queued",
            (EmailOutbox.next_retry_at.is_(None)) | (EmailOutbox.next_retry_at <= now),
        )
        .order_by(EmailOutbox.id.asc())
        .limit(limit)
    )
    rows = result.scalars().all()
    processed = 0
    for row in rows:
        await deliver_outbox_row(db, row, cfg)
        processed += 1
    if processed:
        await db.commit()
    return processed
