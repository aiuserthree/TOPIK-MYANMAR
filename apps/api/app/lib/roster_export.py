"""연명부 xlsx/zip export — 「연명부 양식.xlsx」 B~K 10열 (A열 비움)."""

from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from openpyxl import Workbook

from app.lib.profile_ko_labels import first_language_ko, nationality_ko
from app.lib.validation import gender_to_code

ROSTER_HEADERS = [
    "한글성명",
    "영문성명",
    "생년월일",
    "성별",
    "국적",
    "제1언어",
    "직업코드",
    "응시동기코드",
    "응시목적코드",
    "수험번호",
]

# 「연명부 양식.xlsx」 1행 안내문 — FO/BO topik-export.js 와 동일
ROSTER_GUIDE = [
    "한글성명이 없는 경우,\n영문성명 입력",
    "영문성명 입력\n(신분증 상 영문성명 기재)",
    "숫자 8자리만 입력\n예시) 19991231",
    "성별코드\n\n1:남자\n2:여자",
    "국가 선택",
    "제1언어 선택",
    "직업코드\n1 : 학생\n2 : 공무원(군인)\n3 : 회사원\n4 : 자영업\n5 : 주부\n6 : 교사\n7 : 무직\n8 : 기타",
    "응시동기코드\n1 : 방송\n2 : 신문\n3 : 잡지\n4 : 교육기관\n5 : 포스터\n6 : 친지\n7 : 친구\n8 : 인터넷\n9 : 기타\n10 : 지인(가족, 친구등)\n11 : 토픽홈페이지",
    "응시목적코드\n1 : 유학\n2 : 취업\n3 : 관광\n4 : 학술연구\n5 : 한국어 실력확인\n6 : 한국문화이해\n7 : 기타\n8 : 비자 VISA 영주권\n9 : 학점취득\n10: 사회통합프로그램\n15: 체류자격 관리",
    "수험번호(13자리 숫자만 입력)\n*사진파일명과 동일하게 입력(.jpg 제외)\n*지역별/시험장별/시험수준별 개별 파일",
]

_LEVEL_FOLDER = {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"}
_COUNTRY_NAME = "미얀마"


def roster_export_basename(*, round_no: int | None, venue_name: str) -> str:
    """제{회차}회 TOPIK 지원자 연명부({국가}_{시험장})"""
    venue = _safe_seg(venue_name, "시험장")
    round_part = f"제{round_no}회 " if round_no else ""
    return f"{round_part}TOPIK 지원자 연명부({_COUNTRY_NAME}_{venue})"


def roster_export_filename(
    *,
    round_no: int | None,
    venue_name: str,
    level_pfx: str | None = None,
    multi_level_at_venue: bool = False,
) -> str:
    base = roster_export_basename(round_no=round_no, venue_name=venue_name)
    if multi_level_at_venue and level_pfx:
        return f"{base}_{level_pfx}.xlsx"
    return f"{base}.xlsx"


def _safe_seg(value: str | None, fallback: str) -> str:
    v = (value or "").strip() or fallback
    return re.sub(r'[\\/:*?"<>|]+', "_", v)


def _gender_cell(row: dict[str, Any]) -> int | str:
    """성별 코드 1(남) / 2(여) — 연명부 양식 숫자 셀."""
    raw = row.get("gender")
    if raw is None or str(raw).strip() == "":
        sx = row.get("sx")
        if sx in (1, 2, "1", "2"):
            return int(sx)
        return ""
    code = gender_to_code(str(raw))
    return int(code) if code in ("1", "2") else code


def _code_cell(value: Any) -> int | str:
    if value is None or value == "":
        return ""
    try:
        return int(value)
    except (TypeError, ValueError):
        return value


def _roster_row(row: dict[str, Any]) -> list:
    name_ko = row.get("name_ko") or ""
    name_en = row.get("name_en") or ""
    birth = re.sub(r"[^0-9]", "", str(row.get("birth_date") or ""))[:8]
    return [
        name_ko or name_en,
        name_en,
        birth,
        _gender_cell(row),
        nationality_ko(row.get("nationality")),
        first_language_ko(row.get("first_language")),
        _code_cell(row.get("job_code")),
        _code_cell(row.get("motive_code")),
        _code_cell(row.get("purpose_code")),
        row.get("exam_number") or "",
    ]


def _sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(r: dict[str, Any]) -> tuple:
        exam = r.get("exam_number") or ""
        name = (r.get("name_en") or r.get("name_ko") or "").lower()
        return (0 if exam else 1, exam, name)

    return sorted(rows, key=key)


def _workbook_bytes(headers: list[str], data_rows: list[list]) -> bytes:
    """양식과 동일: A열 비움 · 1행 가이드 · 2행 헤더 · 3행~ 데이터."""
    wb = Workbook()
    ws = wb.active
    ws.title = "연명부"
    guide = ROSTER_GUIDE[: len(headers)]
    ws.append([""] + guide)
    ws.append([""] + headers)
    for row in data_rows:
        ws.append([""] + row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_roster_zip(
    *,
    round_no: int | None,
    groups: dict[str, list[dict[str, Any]]],
) -> tuple[bytes, str]:
    """groups key: level|region|venue_name"""
    levels_by_venue: dict[str, set[str]] = {}
    for key in groups:
        level_pfx, _, venue = key.split("|", 2)
        levels_by_venue.setdefault(venue, set()).add(level_pfx)

    buf = io.BytesIO()
    venues_in_export: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for key, rows in groups.items():
            level_pfx, _, venue = key.split("|", 2)
            venues_in_export.add(venue)
            sorted_rows = _sort_rows(rows)
            data = [_roster_row(r) for r in sorted_rows]
            multi_level = len(levels_by_venue.get(venue, set())) > 1
            filename = roster_export_filename(
                round_no=round_no,
                venue_name=venue,
                level_pfx=level_pfx,
                multi_level_at_venue=multi_level,
            )
            zf.writestr(filename, _workbook_bytes(ROSTER_HEADERS, data))
        if not groups:
            zf.writestr("연명부_대상없음.txt", b"(export target empty)")

    if len(venues_in_export) == 1:
        venue = next(iter(venues_in_export))
        zip_name = f"{roster_export_basename(round_no=round_no, venue_name=venue)}.zip"
    else:
        round_part = f"제{round_no}회 " if round_no else ""
        zip_name = f"{round_part}TOPIK 지원자 연명부.zip"
    buf.seek(0)
    return buf.getvalue(), zip_name


def group_roster_rows(
    rows: list[dict[str, Any]],
    *,
    region_names: dict[tuple[str, str], str],
) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        cc = row.get("country_code") or "025"
        rc = row.get("region_code") or "001"
        region = region_names.get((cc, rc)) or rc
        venue = row.get("venue_name") or row.get("venue_code") or "미지정"
        level = _LEVEL_FOLDER.get(str(row.get("exam_level") or "I").upper(), "TOPIK Ⅰ")
        key = f"{level}|{_safe_seg(region, '지역')}|{_safe_seg(venue, '시험장')}"
        groups.setdefault(key, []).append(row)
    return groups
