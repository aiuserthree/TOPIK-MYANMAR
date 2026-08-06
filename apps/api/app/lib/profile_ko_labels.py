"""FO 다국어 저장값 → 한글 표준값 변환.

BO 관리자 표시·연명부 export 뿐 아니라 저장 시 정규화에도 사용한다.
(FO 화면 언어에 따라 번역 라벨이 그대로 저장되던 과거 데이터 보정)
"""

from __future__ import annotations

NATIONALITY_KO: dict[str, str] = {
    "미얀마": "미얀마",
    "မြန်မာ": "미얀마",
    "မြန်မာနိုင်ငံသား": "미얀마",
    "မြန်မာလူမျိုး": "미얀마",
    "ဗမာ": "미얀마",
    "ဗမာလူမျိုး": "미얀마",
    "Myanmar": "미얀마",
    "Burma": "미얀마",
    "Burmese": "미얀마",
    "미얀마 (Myanmar)": "미얀마",
    "대한민국": "대한민국",
    "한국": "대한민국",
    "ကိုရီးယား": "대한민국",
    "ကိုရီးယားနိုင်ငံသား": "대한민국",
    "ကိုရီးယားလူမျိုး": "대한민국",
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
    "မြန်မာ": "미얀마어",
    "မြန်မာဘာသာ": "미얀마어",
    "မြန်မာစာ": "미얀마어",
    "မြန်မာစကား": "미얀마어",
    "မြန်မာလူမျိုး": "미얀마어",
    "ဗမာဘာသာ": "미얀마어",
    "ဗမာစကား": "미얀마어",
    "ဗမာလူမျိုး": "미얀마어",
    "Burmese": "미얀마어",
    "Myanmar": "미얀마어",
    "미얀마어 (Burmese)": "미얀마어",
    "한국어": "한국어",
    "ကိုရီးယား": "한국어",
    "ကိုရီးယားဘာသာ": "한국어",
    "ကိုရီးယားစကား": "한국어",
    "Korean": "한국어",
    "영어": "영어",
    "အင်္ဂလိပ်ဘာသာ": "영어",
    "အင်္ဂလိပ်စကား": "영어",
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


def normalize_nationality(value: str | None) -> str:
    """저장용 표준값 — 매칭되지 않으면 입력값을 그대로 둔다(데이터 보존)."""
    v = (value or "").strip()
    return NATIONALITY_KO.get(v, v)


def normalize_first_language(value: str | None) -> str:
    """저장용 표준값 — 매칭되지 않으면 입력값을 그대로 둔다(데이터 보존)."""
    v = (value or "").strip()
    return FIRST_LANGUAGE_KO.get(v, v)
