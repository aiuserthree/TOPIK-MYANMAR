# 기능정의서 스크립트

## 체크리스트 감사 (`audit_checklist_status.py`)

`개발자_체크리스트.md`(484항목)의 완료 기호 `[x]` `[p]` `[ ]` `[-]`와 상단 **진행 요약** 블록을 저장소 산출물과 대조합니다.

### 사전 요구

- Python 3.9+
- 저장소 루트에서 실행 (경로는 스크립트가 자동 해석)

### 사용법

```bash
# 요약 블록 vs 실제 행 카운트만 검증 (기본)
python3 docs/기능정의서/scripts/audit_checklist_status.py --validate

# 힌트 출력 + 요약만 갱신 (상태/메모는 변경하지 않음)
python3 docs/기능정의서/scripts/audit_checklist_status.py --dry-run

# 고신뢰(high) artifact 규칙만 반영 + 요약 갱신
python3 docs/기능정의서/scripts/audit_checklist_status.py --apply
```

### 규칙 파일

`checklist_rules.json` — artifact 경로/glob → 체크리스트 NO 범위, 제안 상태, 메모 태그.

| 메모 태그 | 의미 |
| --- | --- |
| `(스키마 초안)` | `DB스키마_초안.md` |
| `(API 명세 초안)` | `REST_API_명세_초안.md` |
| `(워크시트)` | `정책_합의_워크시트.md` |
| `(마이그레이션·시드 v0.1)` | `db/migrations/`, `db/seed/` |
| `(C안 에디토리얼, 14종)` | `시안/email/` |
| `(배포 아키텍처)` | `배포_아키텍처.md` |

`--apply`는 `confidence: "high"` 규칙만 적용하며, 기존 `[x]`/`[p]`/`[-]`는 덮어쓰지 않습니다(`only_if_blank`).

### 기타 스크립트

| 스크립트 | 용도 |
| --- | --- |
| `make_dev_checklist.py` | 체크리스트 xlsx/md 생성 |
| `export_policy_worksheet_xlsx.py` | 정책 워크시트 xlsx 내보내기 |
| `md_to_excel.py` | 기능정의서 md → xlsx |
