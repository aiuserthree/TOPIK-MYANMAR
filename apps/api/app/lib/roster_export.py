"""연명부 xlsx/zip export — 「연명부 양식.xlsx」 B~K 10열."""

from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from openpyxl import Workbook

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

_LEVEL_FOLDER = {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"}


def _safe_seg(value: str | None, fallback: str) -> str:
    v = (value or "").strip() or fallback
    return re.sub(r'[\\/:*?"<>|]+', "_", v)


def _roster_row(row: dict[str, Any]) -> list:
    name_ko = row.get("name_ko") or ""
    name_en = row.get("name_en") or ""
    birth = re.sub(r"[^0-9]", "", str(row.get("birth_date") or ""))[:8]
    gender = str(row.get("gender") or "")
    return [
        name_ko or name_en,
        name_en,
        birth,
        gender,
        row.get("nationality") or "미얀마",
        row.get("first_language") or "",
        row.get("job_code") if row.get("job_code") is not None else "",
        row.get("motive_code") if row.get("motive_code") is not None else "",
        row.get("purpose_code") if row.get("purpose_code") is not None else "",
        row.get("exam_number") or "",
    ]


def _sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(r: dict[str, Any]) -> tuple:
        exam = r.get("exam_number") or ""
        name = (r.get("name_en") or r.get("name_ko") or "").lower()
        return (0 if exam else 1, exam, name)

    return sorted(rows, key=key)


def _workbook_bytes(headers: list[str], data_rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "연명부"
    ws.append(headers)
    for row in data_rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_roster_zip(
    *,
    round_no: int | None,
    groups: dict[str, list[dict[str, Any]]],
) -> tuple[bytes, str]:
    """groups key: level|region|venue_name"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for key, rows in groups.items():
            level_pfx, region, venue = key.split("|", 2)
            sorted_rows = _sort_rows(rows)
            data = [_roster_row(r) for r in sorted_rows]
            filename = f"{level_pfx}_미얀마_{region}_{venue}.xlsx"
            zf.writestr(filename, _workbook_bytes(ROSTER_HEADERS, data))
        if not groups:
            zf.writestr("연명부_대상없음.txt", b"(export target empty)")
    suffix = f"_제{round_no}회" if round_no else ""
    buf.seek(0)
    return buf.getvalue(), f"TOPIK_미얀마_연명부{suffix}.zip"


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
