"""BO 관리자 표시·연명부 export 전용 — FO 다국어 저장값을 한글 라벨로 변환."""

from __future__ import annotations

NATIONALITY_KO: dict[str, str] = {
    "미얀마": "미얀마",
    "မြန်မာ": "미얀마",
    "Myanmar": "미얀마",
    "미얀마 (Myanmar)": "미얀마",
    "대한민국": "대한민국",
    "한국": "대한민국",
    "ကိုရီးယား": "대한민국",
    "Republic of Korea": "대한민국",
    "South Korea": "대한민국",
    "Korea": "대한민국",
    "기타": "기타",
    "အခြား": "기타",
    "Other": "기타",
}

FIRST_LANGUAGE_KO: dict[str, str] = {
    "미얀마어": "미얀마어",
    "버마어": "버마어",
    "မြန်မာဘာသာ": "미얀마어",
    "Burmese": "미얀마어",
    "미얀마어 (Burmese)": "미얀마어",
    "한국어": "한국어",
    "ကိုရီးယားဘာသာ": "한국어",
    "Korean": "한국어",
    "영어": "영어",
    "အင်္ဂလိပ်ဘာသာ": "영어",
    "English": "영어",
    "샨어": "샨어",
    "카렌어": "카렌어",
    "중국어": "중국어",
    "기타": "기타",
    "အခြား": "기타",
    "Other": "기타",
}


def nationality_ko(value: str | None, *, fallback: str = "미얀마") -> str:
    v = (value or "").strip()
    if not v:
        return fallback
    return NATIONALITY_KO.get(v, v)


def first_language_ko(value: str | None, *, fallback: str = "") -> str:
    v = (value or "").strip()
    if not v:
        return fallback
    return FIRST_LANGUAGE_KO.get(v, v)
