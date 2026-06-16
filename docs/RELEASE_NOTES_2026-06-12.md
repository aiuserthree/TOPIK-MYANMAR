# 릴리스 노트 — 2026-06-12

> Git 커밋: `7294367` (환불 약관 초기화) · `aaca5bd` (게시판 수정 검증) · `b1d7c28` (수험표 URL) · `99e871f` (수험번호 부여 대상·로직)

운영 URL: `https://www.topik-myanmar.com` · `https://admin.topik-myanmar.com`

---

## 1. BO — 수험번호 일괄 부여

| 항목 | 내용 |
| --- | --- |
| 부여 대상 | 접수자 목록 상태 **승인완료**(`status=approved`, `approved_at` 있음) + 수험번호 미부여 + 사진 승인 + 수납 완료 |
| 제외 | **접수완료**·**수납대기**만 된 건 → 미리보기 **0건** |
| 권한 | **최고관리자(super)** 만 버튼·API 실행 |
| 추가 부여 | 노출 시점 이후에도 **미부여 승인완료** 건 부여 가능 |
| 채번 | 동일 (시험장×급수) 그룹 내 기존 serial 이어서 배정 |
| 오류 | 시험장 마스터 없음 시 명확한 오류. `assigned=0`이면 `exam_numbers_assigned_at` 미갱신 |
| 진단 | `scripts/diagnose-exam-assign.sh` (DB 상태 점검) |

**관련 파일:** `apps/api/app/routers/admin_api.py`, `html/C안/BO(admin)/project/panels/applicants.jsx`

---

## 2. FO — 수험표 출력 URL

| 버튼 | URL |
| --- | --- |
| **TOPIK 본부에서 수험표 출력** (접수 카드) | `https://www.topik.go.kr/TWMYPG/TWMYPG0030-001.do` |
| **TOPIK 본부 홈페이지로 이동** (하단 안내) | `https://www.topik.go.kr` |

**관련 파일:** `html/C안/FO/ticket.html`

---

## 3. FO — 게시판 검증

| 화면 | 변경 |
| --- | --- |
| 문의 (`qna.html`) | **수정 저장** 시 비밀글 비밀번호(4자+) 재입력 필수 |
| 환불·정정 (`refund-correction.html`) | 글쓰기 진입 시 **약관 체크 해제**. **작성·수정** 모두 비밀번호 + 약관 동의 필수 |
| 공통 (`fo-board.js`) | create·edit 모두 비밀번호 검증 |

---

## 4. 배포

- `scripts/deploy-all-from-git.sh` — `fo-board.js`, `refund-correction.html` 배포 검증 추가
- 서버: `git checkout origin/main` 후 `python3 build.py` / `build-bo.py`, API 재시작

---

## 5. 문서 갱신

- [`docs/사용가이드/BO_사용가이드.md`](사용가이드/BO_사용가이드.md)
- [`docs/사용가이드/FO_사용가이드.md`](사용가이드/FO_사용가이드.md)
- [`docs/통합테스트/통합테스트_시나리오.md`](통합테스트/통합테스트_시나리오.md)
- [`docs/system_design/services/bo-02-applications.md`](system_design/services/bo-02-applications.md)
- [`docs/system_design/database.md`](system_design/database.md)
