"""Admin assist: Korean → Myanmar (Burmese) machine translation."""

from __future__ import annotations

import httpx

_GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"


async def translate_text(text: str, source: str = "ko", target: str = "my") -> str:
    raw = (text or "").strip()
    if not raw:
        return ""

    params = {
        "client": "gtx",
        "sl": source or "ko",
        "tl": target or "my",
        "dt": "t",
        "q": raw,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(_GOOGLE_TRANSLATE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    if not data or not isinstance(data[0], list):
        raise ValueError("unexpected translate response")

    parts: list[str] = []
    for seg in data[0]:
        if seg and seg[0]:
            parts.append(str(seg[0]))
    result = "".join(parts).strip()
    if not result:
        raise ValueError("empty translation")
    return result
