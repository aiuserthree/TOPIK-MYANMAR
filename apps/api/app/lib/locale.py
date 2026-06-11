"""FO UI locale — X-TPKM-Locale header / query ?lang=."""

from __future__ import annotations

from fastapi import Request


def normalize_locale(raw: str | None, fallback: str = "ko") -> str:
    if not raw:
        return fallback
    lang = str(raw).strip().lower()
    if lang in ("kr", "ko"):
        return "ko"
    if lang in ("mm", "my"):
        return "my"
    if lang == "en":
        return "en"
    return fallback


def resolve_request_locale(
    request: Request | None = None,
    query_lang: str | None = None,
    fallback: str = "ko",
) -> str:
    if query_lang:
        return normalize_locale(query_lang, fallback)
    if request is not None:
        header = request.headers.get("x-tpkm-locale")
        if header:
            return normalize_locale(header.strip(), fallback)
    return fallback
