#!/usr/bin/env python3
"""Audit and refresh docs/기능정의서/개발자_체크리스트.md completion column.

Modes
-----
  --validate   Compare top summary vs parsed row counts (default if no flag).
  --dry-run    Print artifact hints and summary diff; do not write.
  --apply      Apply high-confidence artifact hints + refresh summary block.

Status symbols: [x] done  [p] partial  [ ] not started  [-] N/A / blocked

Rules: scripts/checklist_rules.json maps repo artifacts → checklist NO ranges.
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
SPEC_DIR = SCRIPT_DIR.parent
REPO_ROOT = SPEC_DIR.parents[1]
CHECKLIST = SPEC_DIR / "개발자_체크리스트.md"
RULES_FILE = SCRIPT_DIR / "checklist_rules.json"

TOTAL_ITEMS = 484
STATUS_ORDER = ("[x]", "[p]", "[ ]", "[-]")

ROW_LINE_RE = re.compile(
    r"^\| (\d+) \|(.*)\| (\[x\]|\[p\]|\[ \]|\[-\]) \|.*\|  \|$"
)
SUMMARY_ROW_RE = re.compile(
    r"^\| 전체 \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| 484 \|",
    re.MULTILINE,
)
INDEX_TOTAL_RE = re.compile(
    r"(\| 합 계 \| \d+ \| \d+ \| \d+ \| 484 \| )x=\d+ p=\d+ □=\d+ -=\d+( \|)"
)


@dataclass
class ChecklistRow:
    no: int
    line_index: int
    raw_line: str
    body: str
    memo: str
    status: str

    def formatted_line(self) -> str:
        body = self.body.rstrip()
        if self.memo:
            idx = body.rfind("|")
            if idx >= 0:
                body = body[:idx] + f"| {self.memo} "
        return f"| {self.no} |{body}| {self.status} |  |  |"


@dataclass
class Hint:
    no: int
    rule_id: str
    current: str
    suggested: str
    memo_tag: str | None
    confidence: str
    reason: str


@dataclass
class AuditResult:
    rows: dict[int, ChecklistRow] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=lambda: {s: 0 for s in STATUS_ORDER})
    hints: list[Hint] = field(default_factory=list)
    applied: list[Hint] = field(default_factory=list)


def load_rules() -> dict[str, Any]:
    with RULES_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def parse_rows(text: str) -> dict[int, ChecklistRow]:
    rows: dict[int, ChecklistRow] = {}
    for idx, line in enumerate(text.splitlines()):
        m = ROW_LINE_RE.match(line)
        if not m:
            continue
        no = int(m.group(1))
        if no < 1 or no > TOTAL_ITEMS:
            continue
        body = m.group(2)
        status = m.group(3)
        memo = _extract_memo(body)
        rows[no] = ChecklistRow(
            no=no,
            line_index=idx,
            raw_line=line,
            body=body,
            memo=memo,
            status=status,
        )
    return rows


def _extract_memo(body: str) -> str:
    """Best-effort memo field (last segment before status); may be empty."""
    parts = body.split("|")
    if len(parts) >= 5:
        return parts[-1].strip()
    return ""


def count_statuses(rows: dict[int, ChecklistRow]) -> dict[str, int]:
    counts = {s: 0 for s in STATUS_ORDER}
    for row in rows.values():
        counts[row.status] += 1
    return counts


def section_counts(
    rows: dict[int, ChecklistRow], start: int, end: int
) -> dict[str, int]:
    counts = {s: 0 for s in STATUS_ORDER}
    for i in range(start, end + 1):
        row = rows.get(i)
        if row:
            counts[row.status] += 1
    return counts


def pct_done(counts: dict[str, int], total: int) -> float:
    if not total:
        return 0.0
    return round(100 * (counts["[x]"] + counts["[p]"]) / total, 1)


def artifact_exists(repo: Path, rule: dict[str, Any]) -> bool:
    for rel in rule.get("paths", []):
        if (repo / rel).exists():
            return True
    for pattern in rule.get("globs", []):
        if list(repo.glob(pattern)):
            return True
    return False


def memo_has_tag(memo: str, tag: str | None, memo_tags: dict[str, str]) -> bool:
    if not tag:
        return True
    label = memo_tags.get(tag, tag)
    return label in memo or f"**{label}**" in memo


def append_memo_tag(memo: str, tag: str | None, memo_tags: dict[str, str]) -> str:
    if not tag or memo_has_tag(memo, tag, memo_tags):
        return memo
    label = memo_tags[tag]
    suffix = f" · **{label}**"
    return memo + suffix if memo else label


def collect_hints(
    rows: dict[int, ChecklistRow], rules: dict[str, Any], repo: Path
) -> list[Hint]:
    hints: list[Hint] = []
    memo_tags = rules.get("memo_tags", {})

    for rule in rules.get("artifact_rules", []):
        if not artifact_exists(repo, rule):
            continue
        for no in rule.get("nos", []):
            row = rows.get(no)
            if not row:
                continue
            suggested = rule.get("hint_status", "[p]")
            tag = rule.get("memo_tag")
            confidence = rule.get("confidence", "medium")
            only_blank = rule.get("only_if_blank", True)

            status_change = row.status != suggested
            if only_blank and row.status != "[ ]":
                status_change = False
            elif suggested == "[p]" and row.status == "[x]":
                status_change = False
            elif suggested == "[ ]":
                status_change = False

            memo_change = tag and not memo_has_tag(row.memo, tag, memo_tags)
            if not status_change and not memo_change:
                continue

            hints.append(
                Hint(
                    no=no,
                    rule_id=rule["id"],
                    current=row.status,
                    suggested=suggested if status_change else row.status,
                    memo_tag=tag,
                    confidence=confidence,
                    reason=rule.get("description", rule["id"]),
                )
            )
    return sorted(hints, key=lambda h: (h.no, h.rule_id))


def apply_hints(
    rows: dict[int, ChecklistRow],
    hints: list[Hint],
    memo_tags: dict[str, str],
    *,
    high_confidence_only: bool,
) -> list[Hint]:
    applied: list[Hint] = []
    for hint in hints:
        if high_confidence_only and hint.confidence != "high":
            continue
        row = rows[hint.no]
        changed = False

        if hint.suggested != row.status:
            if hint.confidence == "high" or not high_confidence_only:
                row.status = hint.suggested
                changed = True

        if hint.memo_tag:
            new_memo = append_memo_tag(row.memo, hint.memo_tag, memo_tags)
            if new_memo != row.memo:
                row.memo = new_memo
                changed = True

        if changed:
            row.raw_line = row.formatted_line()
            applied.append(hint)
    return applied


def rebuild_body(text: str, rows: dict[int, ChecklistRow]) -> str:
    lines = text.splitlines()
    for row in rows.values():
        lines[row.line_index] = row.raw_line
    return "\n".join(lines) + ("\n" if text.endswith("\n") else "")


def parse_summary_counts(text: str) -> dict[str, int] | None:
    m = SUMMARY_ROW_RE.search(text)
    if not m:
        return None
    return {
        "[x]": int(m.group(1)),
        "[p]": int(m.group(2)),
        "[ ]": int(m.group(3)),
        "[-]": int(m.group(4)),
    }


def build_legend_block(rows: dict[int, ChecklistRow], rules: dict[str, Any]) -> str:
    counts = count_statuses(rows)
    fo = section_counts(rows, 1, 83)
    bo = section_counts(rows, 84, 142)
    fo_pct = pct_done(fo, 83)
    bo_pct = pct_done(bo, 59)
    proto_pct = pct_done(counts, TOTAL_ITEMS)
    prod_pct = round(100 * counts["[x]"] / TOTAL_ITEMS, 1)
    audit_date = date.today().isoformat()

    return f"""## 감사 범례 ({audit_date})

| 기호 | 의미 |
| --- | --- |
| `[x]` | **프로토타입 완료** — `html/C안/FO`(배포 `public/`) 또는 A/B안 UI·localStorage 목업으로 요구사항 반영 |
| `[p]` | **부분** — UI/목업만 있거나 스펙 대비 미흡(백엔드·운영·정책 미확정 포함) |
| `[ ]` | **미착수** — 코드·인프라 근거 없음 |
| `[-]` | **N/A·보류** — 운영/법무/정책 합의 전제. 개발만으로 완료 불가 |

### 진행 요약 (자동 감사)

| 구분 | `[x]` | `[p]` | `[ ]` | `[-]` | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 전체 | {counts['[x]']} | {counts['[p]']} | {counts['[ ]']} | {counts['[-]']} | 484 |
| FO 화면 (1–83) | {fo['[x]']} | {fo['[p]']} | {fo['[ ]']} | {fo['[-]']} | 83 | **{fo_pct}%** (`[x]`+`[p]`) |
| BO 화면 (84–142) | {bo['[x]']} | {bo['[p]']} | {bo['[ ]']} | {bo['[-]']} | 59 | **{bo_pct}%** |
| 프로토타입 전체 | — | — | — | — | 484 | **{proto_pct}%** (`[x]`+`[p]`) |
| 프로덕션 (`[x]`만) | — | — | — | — | 484 | **{prod_pct}%** (DB·인프라·SMTP 미구현) |

> 감사 기준: 배포 라인 `build.py` → `html/C안/FO` → `public/` (`배포_아키텍처.md`). DB·SMTP·서버·법무는 프로덕션 미착수. **정책 합의(463–484)** → `정책_합의_워크시트.md` 작성·고객사 확정 대기 (`[p]` `(워크시트)`). 규칙: `scripts/checklist_rules.json` · 감사: `scripts/audit_checklist_status.py`."""


def refresh_legend(text: str, legend: str) -> str:
    if "## 감사 범례" in text:
        return re.sub(
            r"## 감사 범례 \(.*?\).*?(?=\n\n\| TOPIK Myanmar)",
            legend.rstrip(),
            text,
            count=1,
            flags=re.DOTALL,
        )
    return text.replace("## INDEX\n\n", "## INDEX\n\n" + legend + "\n\n", 1)


def refresh_index_total(text: str, counts: dict[str, int]) -> str:
    replacement = (
        rf"\1x={counts['[x]']} p={counts['[p]']} □={counts['[ ]']} -={counts['[-]']}\2"
    )
    return INDEX_TOTAL_RE.sub(replacement, text, count=1)


def run_audit(
    *,
    dry_run: bool = False,
    apply: bool = False,
    validate_only: bool = False,
) -> AuditResult:
    rules = load_rules()
    text = CHECKLIST.read_text(encoding="utf-8")
    rows = parse_rows(text)
    if len(rows) != TOTAL_ITEMS:
        raise SystemExit(f"Expected {TOTAL_ITEMS} checklist rows, parsed {len(rows)}")

    result = AuditResult(rows=rows, counts=count_statuses(rows))
    result.hints = collect_hints(rows, rules, REPO_ROOT)

    summary_before = parse_summary_counts(text)
    print(f"Parsed {len(rows)} rows: {result.counts}")
    if summary_before:
        print(f"Summary block:  {summary_before}")
        if summary_before != result.counts:
            print("  ⚠ summary mismatch — refresh recommended")

    if result.hints:
        print(f"\nArtifact hints ({len(result.hints)}):")
        for h in result.hints[:30]:
            tag = f" memo+{h.memo_tag}" if h.memo_tag else ""
            print(
                f"  NO.{h.no:3d} {h.current}→{h.suggested}{tag}"
                f" [{h.confidence}] {h.rule_id}: {h.reason}"
            )
        if len(result.hints) > 30:
            print(f"  ... and {len(result.hints) - 30} more")
    else:
        print("\nNo artifact hints (checklist matches repo artifacts).")

    if validate_only:
        return result

    if dry_run and not apply:
        print("\n(dry-run — no files written)")
        return result

    if apply:
        result.applied = apply_hints(
            rows,
            result.hints,
            rules.get("memo_tags", {}),
            high_confidence_only=True,
        )
        if result.applied:
            print(f"\nApplied {len(result.applied)} high-confidence update(s):")
            for h in result.applied:
                print(f"  NO.{h.no} {h.rule_id}")
        result.counts = count_statuses(rows)
        text = rebuild_body(text, rows)

        legend = build_legend_block(rows, rules)
        text = refresh_legend(text, legend)
        text = refresh_index_total(text, result.counts)
        CHECKLIST.write_text(text, encoding="utf-8")
        print(f"\nApplied → {CHECKLIST.relative_to(REPO_ROOT)}")
        print(f"Final counts: {result.counts}")
        fo_pct = pct_done(section_counts(rows, 1, 83), 83)
        bo_pct = pct_done(section_counts(rows, 84, 142), 59)
        proto_pct = pct_done(result.counts, TOTAL_ITEMS)
        print(
            f"FO prototype {fo_pct}% | BO prototype {bo_pct}% | "
            f"overall prototype {proto_pct}%"
        )
    elif dry_run:
        would = [h for h in result.hints if h.confidence == "high"]
        print(f"\n(dry-run — {len(would)} high-confidence hint(s) would apply; no files written)")
        print(f"Would-be summary: {result.counts}")

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--validate",
        action="store_true",
        help="Compare summary vs row counts only (default)",
    )
    group.add_argument(
        "--dry-run",
        action="store_true",
        help="Show hints; refresh summary without status/memo changes",
    )
    group.add_argument(
        "--apply",
        action="store_true",
        help="Apply high-confidence hints and refresh summary",
    )
    args = parser.parse_args()

    if args.apply:
        run_audit(apply=True)
    elif args.dry_run:
        run_audit(dry_run=True)
    else:
        run_audit(validate_only=True)


if __name__ == "__main__":
    main()
