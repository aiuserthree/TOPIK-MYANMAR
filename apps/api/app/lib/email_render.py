"""C안 에디토리얼 (THEMES.C) HTML email renderer — ported from 시안/email/templates/."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import escape
from typing import Any

FONT = (
    "'Pretendard','Pretendard JP',-apple-system,BlinkMacSystemFont,"
    "'Apple SD Gothic Neo','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
)
MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace"
SUPPORT_EMAIL = "topik.myanmar@koica.go.kr"

THEME_C = {
    "page_bg": "#ffffff",
    "card_bg": "#ffffff",
    "ink": "#0e1c33",
    "body": "#2f3947",
    "sub": "#7a828c",
    "primary": "#1a4fa0",
    "primary_dark": "#0e1c33",
    "on_primary": "#ffffff",
    "accent_tint": "#f4f6fa",
    "line": "#e6e9ef",
    "card_pad": 44,
    "outer_pad": 0,
    "status": {"positive": "#0a7d3c", "warn": "#b76b00", "negative": "#c8322b"},
    "status_tint": {"positive": "#eef6f1", "warn": "#faf3e8", "negative": "#f9edec"},
}

FOOTER = {
    "sending_note": "본 메일은 발신 전용입니다. 회신하셔도 답변을 받으실 수 없습니다.",
    "support_label": "문의",
    "operator": "주미얀마 대한민국 대사관 운영 · 국립국제교육원(NIIED) 주관",
    "copyright": "© {year} TOPIK Myanmar. All rights reserved.",
}


@dataclass
class Cta:
    label: str
    href: str
    kind: str = "primary"


@dataclass
class EmailLayout:
    subject: str
    preheader: str
    eyebrow_ko: str
    eyebrow_en: str
    index_no: str
    h1: str
    intro: str
    blocks: list[dict[str, Any]] = field(default_factory=list)
    ctas: list[Cta] = field(default_factory=list)


def _esc(value: Any) -> str:
    return escape(str(value)) if value is not None else ""


def _sub(text: str, variables: dict[str, Any]) -> str:
    if not text:
        return ""
    out = text
    for key, value in variables.items():
        out = out.replace(f"{{{key}}}", str(value))
    return out


def _eyebrow(tpl: EmailLayout) -> str:
    t = THEME_C
    txt = tpl.eyebrow_en
    return (
        f'<tr><td style="padding:0 0 18px;">'
        f'<span style="font:700 12px/1 {FONT};letter-spacing:.22em;color:{t["primary"]};'
        f'text-transform:uppercase;">{_esc(tpl.index_no)} &nbsp;/&nbsp; {_esc(txt)}</span>'
        f'<div style="height:1px;background:{t["line"]};margin-top:14px;"></div>'
        f"</td></tr>"
    )


def _header() -> str:
    t = THEME_C
    pad = t["card_pad"]
    return (
        f'<tr><td class="ed-header ed-header-minimal ed-pad" style="background:{t["card_bg"]};'
        f'padding:30px {pad}px 0;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        f'<tr><td style="font:800 15px/1.1 {FONT};letter-spacing:.18em;color:{t["ink"]};'
        f'text-transform:uppercase;">TOPIK MYANMAR</td>'
        f'<td align="right" style="font:600 11px/1.3 {FONT};letter-spacing:.14em;color:{t["sub"]};'
        f'text-transform:uppercase;">한국어능력시험</td></tr></table>'
        f'<div style="height:2px;background:{t["ink"]};margin-top:18px;"></div>'
        f"</td></tr>"
    )


def _button(cta: Cta) -> str:
    t = THEME_C
    primary = cta.kind == "primary"
    bg = t["primary"] if primary else t["card_bg"]
    fg = t["on_primary"] if primary else t["primary"]
    border = t["primary"] if primary else t["line"]
    arrow = '<span style="padding-left:10px;font-weight:400;">→</span>'
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        f'<tr><td align="center" style="background:{bg};border:1px solid {border};border-radius:0;">'
        f'<a href="{_esc(cta.href)}" style="display:block;padding:15px 30px;font:700 15px/1.2 {FONT};'
        f'color:{fg};text-decoration:none;letter-spacing:.06em;">{_esc(cta.label)}{arrow}</a>'
        f"</td></tr></table>"
    )


def _cta_block(ctas: list[Cta]) -> str:
    if not ctas:
        return ""
    rows = "".join(
        f'<tr><td style="padding-top:{0 if i == 0 else 10}px;">{_button(cta)}</td></tr>'
        for i, cta in enumerate(ctas)
    )
    return (
        f'<tr><td style="padding:30px 0 4px;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">{rows}</table>'
        f"</td></tr>"
    )


def _code_block(block: dict[str, Any], variables: dict[str, Any]) -> str:
    t = THEME_C
    mono = MONO if block.get("mono") else FONT
    fs = 30 if block.get("mono") else 40
    sub = block.get("sub")
    return (
        f'<tr><td style="padding:8px 0 4px;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
        f'<td align="center" style="background:{t["accent_tint"]};border:1px solid {t["line"]};'
        f'border-radius:0;padding:26px 20px;">'
        f'<div style="font:600 12px/1 {FONT};letter-spacing:.1em;color:{t["sub"]};'
        f'text-transform:uppercase;margin-bottom:12px;">{_esc(block["label"])}</div>'
        f'<div style="font:800 {fs}px/1.1 {mono};letter-spacing:.12em;color:{t["primary"]};">'
        f'{_esc(_sub(block["value"], variables))}</div>'
        + (
            f'<div style="font:500 13px/1.4 {FONT};color:{t["sub"]};margin-top:12px;">'
            f'{_esc(_sub(sub, variables))}</div>'
            if sub
            else ""
        )
        + "</td></tr></table></td></tr>"
    )


def _info_table(block: dict[str, Any], variables: dict[str, Any]) -> str:
    t = THEME_C
    rows = []
    for i, row in enumerate(block["rows"]):
        border = "0" if i == 0 else f"1px solid {t['line']}"
        rows.append(
            f'<tr><td style="padding:13px 0;border-top:{border};font:500 14px/1.5 {FONT};'
            f'color:{t["sub"]};white-space:nowrap;width:96px;vertical-align:top;">{_esc(row[0])}</td>'
            f'<td style="padding:13px 0 13px 16px;border-top:{border};font:600 14px/1.5 {FONT};'
            f'color:{t["ink"]};">{_esc(_sub(row[1], variables))}</td></tr>'
        )
    return (
        f'<tr><td style="padding:6px 0;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
        f'style="background:{t["accent_tint"]};border:1px solid {t["line"]};border-radius:0;padding:4px 18px;">'
        f"{''.join(rows)}</table></td></tr>"
    )


def _notice_block(block: dict[str, Any], variables: dict[str, Any]) -> str:
    t = THEME_C
    tone = block.get("tone", "info")
    color = t["primary"] if tone == "info" else t["status"][tone]
    tint = t["accent_tint"] if tone == "info" else t["status_tint"][tone]
    return (
        f'<tr><td style="padding:8px 0;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
        f'<td style="background:{tint};border-radius:0;padding:15px 18px;border-left:3px solid {color};">'
        f'<span style="font:500 14px/1.6 {FONT};color:{t["body"]};">'
        f'{_esc(_sub(block["text"], variables))}</span></td></tr></table></td></tr>'
    )


def _paragraph(block: dict[str, Any], variables: dict[str, Any]) -> str:
    t = THEME_C
    return (
        f'<tr><td style="padding:10px 0;font:500 15px/1.7 {FONT};color:{t["body"]};">'
        f'{_esc(_sub(block["text"], variables))}</td></tr>'
    )


def _render_block(block: dict[str, Any], variables: dict[str, Any]) -> str:
    kind = block.get("type", "paragraph")
    if kind == "code":
        return _code_block(block, variables)
    if kind == "infoTable":
        return _info_table(block, variables)
    if kind == "notice":
        return _notice_block(block, variables)
    return _paragraph(block, variables)


def _footer(site_url: str, site_url_full: str) -> str:
    t = THEME_C
    pad = t["card_pad"]
    year = str(datetime.now(timezone.utc).year)
    return (
        f'<tr><td style="background:{t["primary_dark"]};padding:26px {pad}px;border-top:1px solid rgba(255,255,255,.16);">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        f'<tr><td style="font:600 13px/1.5 {FONT};color:rgba(255,255,255,.92);">{_esc(FOOTER["sending_note"])}</td></tr>'
        f'<tr><td style="padding-top:12px;font:500 12px/1.7 {FONT};color:rgba(255,255,255,.55);">'
        f'{_esc(FOOTER["support_label"])} &nbsp;'
        f'<a href="{_esc(site_url_full)}" style="color:#fff;text-decoration:none;">{_esc(site_url)}</a> &nbsp;·&nbsp; '
        f'<a href="mailto:{_esc(SUPPORT_EMAIL)}" style="color:#fff;text-decoration:none;">{_esc(SUPPORT_EMAIL)}</a>'
        f"</td></tr>"
        f'<tr><td style="padding-top:16px;border-top:1px solid rgba(255,255,255,.16);"></td></tr>'
        f'<tr><td style="padding-top:14px;font:500 12px/1.7 {FONT};color:rgba(255,255,255,.55);">{_esc(FOOTER["operator"])}</td></tr>'
        f'<tr><td style="padding-top:4px;font:500 12px/1.7 {FONT};color:rgba(255,255,255,.55);">'
        f'{_esc(FOOTER["copyright"].replace("{year}", year))}</td></tr>'
        f"</table></td></tr>"
    )


def render_c_html(tpl: EmailLayout, variables: dict[str, Any], *, locale: str = "ko") -> str:
    t = THEME_C
    pad = t["card_pad"]
    resolved = {**variables}
    for key in ("userName", "user_name", "verificationCode", "verification_code", "expiresMinutes", "expires_minutes"):
        if key in variables and key not in resolved:
            resolved[key] = variables[key]

    blocks_html = "".join(_render_block(b, resolved) for b in tpl.blocks)
    ctas = [_cta_block(tpl.ctas)] if tpl.ctas else []
    preheader = _sub(tpl.preheader, resolved)
    subject = _sub(tpl.subject, resolved)
    html_lang = "my" if locale.startswith("my") else "en" if locale.startswith("en") else "ko"

    body = (
        f'<tr><td style="padding:34px {pad}px {pad}px;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        f"{_eyebrow(tpl)}"
        f'<tr><td style="padding:0 0 16px;font:800 28px/1.3 {FONT};letter-spacing:-.01em;color:{t["ink"]};">'
        f'{_esc(_sub(tpl.h1, resolved))}</td></tr>'
        f'<tr><td style="padding:0 0 6px;font:500 15px/1.7 {FONT};color:{t["body"]};">'
        f'{_esc(_sub(tpl.intro, resolved))}</td></tr>'
        f"{blocks_html}"
        f"{''.join(ctas)}"
        f"</table></td></tr>"
    )

    card = (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" '
        f'style="width:600px;max-width:600px;background:{t["card_bg"]};border-radius:0;overflow:hidden;">'
        f"{_header()}{body}{_footer(resolved.get('siteUrl', ''), resolved.get('siteUrlFull', ''))}"
        f"</table>"
    )

    return (
        f"<!DOCTYPE html><html lang=\"{html_lang}\"><head><meta charset=\"utf-8\">"
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="x-apple-disable-message-reformatting">'
        f"<title>{_esc(subject)}</title>"
        f"<style>"
        f"@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');"
        f"body{{margin:0;padding:0;background:{t['page_bg']};-webkit-text-size-adjust:100%;}}"
        f"a{{color:inherit;}}"
        f"</style></head>"
        f'<body style="margin:0;padding:0;background:{t["page_bg"]};font-family:{FONT};">'
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{_esc(preheader)}</div>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
        f'style="background:{t["page_bg"]};">'
        f'<tr><td align="center" style="padding:12px 0;">{card}</td></tr>'
        f"</table></body></html>"
    )


def _base_variables(extra: dict[str, Any], public_fo_base: str) -> dict[str, Any]:
    base = public_fo_base.rstrip("/")
    host = base.replace("https://", "").replace("http://", "")
    return {
        "siteUrl": host,
        "siteUrlFull": base,
        "supportEmail": SUPPORT_EMAIL,
        "year": str(datetime.now(timezone.utc).year),
        **extra,
    }


SIGNUP_VERIFY_LAYOUTS: dict[str, EmailLayout] = {
    "ko": EmailLayout(
        subject="[TOPIK Myanmar] 이메일 인증코드 안내",
        preheader="인증코드 6자리를 입력해 회원가입을 완료하세요. (유효시간 {expiresMinutes}분)",
        eyebrow_ko="이메일 인증",
        eyebrow_en="EMAIL VERIFICATION",
        index_no="01",
        h1="이메일 인증코드",
        intro="{userName} 님, TOPIK Myanmar 회원가입을 진행하고 있습니다. 아래 인증코드를 입력해 이메일 인증을 완료해 주세요.",
        blocks=[
            {"type": "code", "label": "인증코드", "value": "{verificationCode}", "sub": "유효시간 {expiresMinutes}분"},
            {
                "type": "paragraph",
                "text": "인증코드는 발송 시점부터 {expiresMinutes}분간 유효합니다. 시간이 지났다면 인증코드를 다시 요청해 주세요.",
            },
            {"type": "notice", "tone": "info", "text": "본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다."},
        ],
        ctas=[Cta("회원가입 계속하기", "{signupUrl}")],
    ),
    "my": EmailLayout(
        subject="[TOPIK Myanmar] အီးမေးလ် အတည်ပြုကုဒ်",
        preheader="အကောင့်ဖွင့်ရန် ၆ လုံး ကုဒ်ကို ထည့်သွင်းပါ။ (သက်တမ်း {expiresMinutes} မိနစ်)",
        eyebrow_ko="အီးမေးလ်အတည်ပြု",
        eyebrow_en="EMAIL VERIFICATION",
        index_no="01",
        h1="အီးမေးလ် အတည်ပြုကုဒ်",
        intro="မင်္ဂလာပါ {userName} ရှင့်၊ TOPIK Myanmar အကောင့်ဖွင့်ခြင်းကို ဆက်လက်လုပ်ဆောင်နေပါသည်။ အောက်ပါ ကုဒ်ဖြင့် အီးမေးလ်ကို အတည်ပြုပါ။",
        blocks=[
            {"type": "code", "label": "အတည်ပြုကုဒ်", "value": "{verificationCode}", "sub": "သက်တမ်း {expiresMinutes} မိနစ်"},
            {
                "type": "paragraph",
                "text": "ကုဒ်သည် ပို့ချိန်မှ {expiresMinutes} မိနစ်သာ သက်တမ်းရှိပါသည်။",
            },
            {"type": "notice", "tone": "info", "text": "သင်တောင်းဆိုခြင်းမဟုတ်ပါက ဤအီးမေးလ်ကို လျစ်လျူရှုပါ။"},
        ],
        ctas=[Cta("အကောင့်ဖွင့်ဆက်လုပ်ရန်", "{signupUrl}")],
    ),
    "en": EmailLayout(
        subject="[TOPIK Myanmar] Email verification code",
        preheader="Enter the 6-digit code to complete signup. (Valid for {expiresMinutes} minutes)",
        eyebrow_ko="이메일 인증",
        eyebrow_en="EMAIL VERIFICATION",
        index_no="01",
        h1="Email verification code",
        intro="Hello {userName}, you are signing up for TOPIK Myanmar. Enter the code below to verify your email.",
        blocks=[
            {"type": "code", "label": "Verification code", "value": "{verificationCode}", "sub": "Valid for {expiresMinutes} minutes"},
            {
                "type": "paragraph",
                "text": "The code is valid for {expiresMinutes} minutes from the time this email was sent.",
            },
            {"type": "notice", "tone": "info", "text": "If you did not request this, you may ignore this email."},
        ],
        ctas=[Cta("Continue signup", "{signupUrl}")],
    ),
}

PASSWORD_RESET_LAYOUTS: dict[str, EmailLayout] = {
    "ko": EmailLayout(
        subject="[TOPIK Myanmar] 비밀번호 재설정 안내",
        preheader="아래 인증코드를 입력해 {expiresMinutes}분 안에 비밀번호를 재설정하세요.",
        eyebrow_ko="비밀번호 재설정",
        eyebrow_en="PASSWORD RESET",
        index_no="02",
        h1="비밀번호 재설정 인증코드",
        intro="{userName} 님, 비밀번호 재설정 요청을 접수했습니다. 아래 인증코드를 입력해 새 비밀번호를 설정해 주세요.",
        blocks=[
            {"type": "code", "label": "인증코드", "value": "{verificationCode}", "sub": "유효시간 {expiresMinutes}분"},
            {"type": "notice", "tone": "warn", "text": "이 코드는 발송 후 {expiresMinutes}분간만 유효하며, 한 번만 사용할 수 있습니다."},
            {
                "type": "paragraph",
                "text": "본인이 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다.",
            },
        ],
        ctas=[Cta("비밀번호 재설정", "{resetUrl}")],
    ),
    "my": EmailLayout(
        subject="[TOPIK Myanmar] စကားဝှက် ပြန်လည်သတ်မှတ်ရန် ကုဒ်",
        preheader="အောက်ပါ ကုဒ်ဖြင့် {expiresMinutes} မိနစ်အတွင်း စကားဝှက်ကို ပြန်လည်သတ်မှတ်ပါ။",
        eyebrow_ko="စကားဝှက်ပြန်လည်သတ်မှတ်",
        eyebrow_en="PASSWORD RESET",
        index_no="02",
        h1="စကားဝှက် ပြန်လည်သတ်မှတ်ရန် ကုဒ်",
        intro="မင်္ဂလာပါ {userName} ရှင့်၊ စကားဝှက် ပြန်လည်သတ်မှတ်ရန် တောင်းဆိုချက်ကို လက်ခံပါသည်။ အောက်ပါ ကုဒ်ကို ထည့်သွင်းပါ။",
        blocks=[
            {"type": "code", "label": "အတည်ပြုကုဒ်", "value": "{verificationCode}", "sub": "သက်တမ်း {expiresMinutes} မိနစ်"},
            {"type": "notice", "tone": "warn", "text": "ဤကုဒ်သည် ပို့ချိန်မှ {expiresMinutes} မိနစ်သာ သက်တမ်းရှိပြီး တစ်ကြိမ်သာ အသုံးပြုနိုင်ပါသည်။"},
            {"type": "paragraph", "text": "သင်တောင်းဆိုခြင်းမဟုတ်ပါက ဤအီးမေးလ်ကို လျစ်လျူရှုပါ။ စကားဝှက်ကို မပြောင်းလဲပါ။"},
        ],
        ctas=[Cta("စကားဝှက်ပြန်လည်သတ်မှတ်", "{resetUrl}")],
    ),
    "en": EmailLayout(
        subject="[TOPIK Myanmar] Password reset code",
        preheader="Enter the code below to reset your password within {expiresMinutes} minutes.",
        eyebrow_ko="비밀번호 재설정",
        eyebrow_en="PASSWORD RESET",
        index_no="02",
        h1="Password reset code",
        intro="Hello {userName}, we received a password reset request. Enter the code below to set a new password.",
        blocks=[
            {"type": "code", "label": "Verification code", "value": "{verificationCode}", "sub": "Valid for {expiresMinutes} minutes"},
            {"type": "notice", "tone": "warn", "text": "This code is valid for {expiresMinutes} minutes and can be used only once."},
            {"type": "paragraph", "text": "If you did not request this, ignore this email. Your password will not change."},
        ],
        ctas=[Cta("Reset password", "{resetUrl}")],
    ),
}


def render_signup_verify_code(locale: str, variables: dict[str, Any], public_fo_base: str) -> tuple[str, str, str]:
    lang = locale[:2].lower() if locale else "ko"
    if lang not in SIGNUP_VERIFY_LAYOUTS:
        lang = "ko"
    layout = SIGNUP_VERIFY_LAYOUTS[lang]
    merged = _base_variables(
        {
            "userName": variables.get("userName") or variables.get("user_name") or "",
            "verificationCode": variables.get("verificationCode") or variables.get("verification_code") or "",
            "expiresMinutes": str(variables.get("expiresMinutes") or variables.get("expires_minutes") or "5"),
            "signupUrl": f"{public_fo_base.rstrip('/')}/signup.html",
        },
        public_fo_base,
    )
    subject = _sub(layout.subject, merged)
    text = (
        f"{merged['userName']}\n\n"
        f"{merged['verificationCode']}\n"
        f"({merged['expiresMinutes']} min)\n"
    )
    html = render_c_html(layout, merged, locale=lang)
    return subject, text.strip(), html


def render_password_reset(locale: str, variables: dict[str, Any], public_fo_base: str) -> tuple[str, str, str]:
    lang = locale[:2].lower() if locale else "ko"
    if lang not in PASSWORD_RESET_LAYOUTS:
        lang = "ko"
    layout = PASSWORD_RESET_LAYOUTS[lang]
    email = variables.get("email") or variables.get("to_email") or ""
    merged = _base_variables(
        {
            "userName": variables.get("userName") or variables.get("user_name") or "",
            "verificationCode": variables.get("verificationCode") or variables.get("verification_code") or "",
            "expiresMinutes": str(variables.get("expiresMinutes") or variables.get("expires_minutes") or "30"),
            "email": email,
            "resetUrl": variables.get("resetUrl")
            or variables.get("reset_url")
            or f"{public_fo_base.rstrip('/')}/password-reset.html",
        },
        public_fo_base,
    )
    subject = _sub(layout.subject, merged)
    text = (
        f"{merged['userName']}\n\n"
        f"{merged['verificationCode']}\n"
        f"({merged['expiresMinutes']} min)\n"
    )
    html = render_c_html(layout, merged, locale=lang)
    return subject, text.strip(), html
