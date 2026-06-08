# 대시보드 상세 설계 (BO)

> 근거 기능정의서: `docs/기능정의서/BO/01_대시보드_기능정의서.md` · 화면 ID 접두: `TPKM_BO_1_*`
> 데이터 모델: `docs/기능정의서/DB스키마_초안.md` · API: `docs/기능정의서/REST_API_명세_초안.md` · 참고 패널: `html/C안/BO(admin)/project/panels/dashboard.jsx`

---

## 1. 서비스 개요

| 항목 | 내용 |
| --- | --- |
| 목적 | 로그인 직후 노출되는 운영 현황 요약. 회차 단위 KPI 7종 + 최근 접수/게시판 미리보기. 각 카드/행은 접수 관리·콘텐츠 패널로의 진입점. |
| 범위 | 읽기 전용 집계·미리보기. 상태 변경 액션 없음(드릴다운 네비게이션만). |
| 주요 액터 | super · admin · readonly **전 등급 조회 가능**(`require_any_admin`) |
| 관련 요구사항ID | TPKM_BO_REQ_008, TPKM_BO_REQ_001, TPKM_BO_REQ_013 |

### 페이지(컴포넌트) 목록

| 화면명 | 화면 ID | 타입 | BO 패널 | 접근 권한 |
| --- | --- | --- | --- | --- |
| 대시보드 | `TPKM_BO_1_1_0_0_0_P` | 페이지 | `dashboard.jsx` | 전 등급 |
| KPI 카드(7종) | `TPKM_BO_1_1_1_0_0_C` | 컴포넌트 | `dashboard.jsx` | 전 등급 |
| 최근 접수 표(5건) | `TPKM_BO_1_1_2_0_0_C` | 컴포넌트 | `dashboard.jsx` | 전 등급 |

---

## 2. 페이지별 상세 설계

### 2.1 대시보드 메인 — `TPKM_BO_1_1_0_0_0_P`

- **개요**: 활성 회차 기준 KPI 카드·최근 접수·최근 게시판을 한 화면에 표시. 헤더 회차 `select` 변경 시 모든 카드/표가 동적 재조회.
- **데이터 소스 원칙**: 모든 통계는 **동일 서버 집계 소스**를 사용해야 한다. KPI 카드 합계 = 접수자 목록 필터 카운트와 일치해야 함(정합성 검증).

#### 액션 상세

| 항목 | 내용 |
| --- | --- |
| 액션/트리거 | 페이지 진입 / 회차 select 변경 / 자동 갱신(권장 30초~1분 폴링) |
| 입력 & 검증 | `exam_round_id`(미지정 시 활성 회차 기본). 정수 검증, 미존재 → 빈 집계 |
| 처리 | 회차 컨텍스트로 `applications`·`board_posts` 집계 쿼리 수행 → KPI 7종 + 최근 목록 산출 |
| 권한 체크 | `require_any_admin`(전 등급) |
| 이력 기록 | ❌(조회 전용) |
| 연동 API | REST 초안 `GET /api/v1/admin/dashboard/summary` — **현재 미구현**. 클라이언트가 `GET /admin/applications`, `GET /admin/board/posts`로 산출 중 → **전용 집계 API 신설 권장(합의)** |
| 연동 DB | `applications`, `board_posts`, `exam_rounds`(회차 select) |
| 결과/후속 | 카드 클릭/“전체 보기” → 접수/콘텐츠 패널로 필터 적용 진입 |
| 예외/성능 | 집계는 사전계산(materialized view)·캐시(Redis, TTL 1분) 권장. 갱신 실패 시 재시도 버튼·“N초 전 업데이트” 표기 |

### 2.2 KPI 카드(7종) — `TPKM_BO_1_1_1_0_0_C`

각 카드는 회차 컨텍스트(`exam_round_id`) 하에 다음 집계로 산출한다.

| # | 카드 | 집계 정의(논리) | 연동 DB·컬럼 | 클릭 시 드릴다운 |
| --: | --- | --- | --- | --- |
| 1 | 전체 접수자 | `count(applications WHERE round AND status<>'cancelled')` | `applications.status` | 접수자 목록 전체 |
| 2 | 검토 대기 | `count(... photo_review_status='pending')` (사진 미심사) | `applications.photo_review_status` | 목록 상태칩=사진심사중/미심사 |
| 3 | 승인 완료 | `count(... status IN ('approved','exam_number_assigned'))` | `applications.status` | 목록 상태칩=승인완료 |
| 4 | TOPIK Ⅰ | `count(... exam_level='I' AND status<>'cancelled')` | `applications.exam_level` | 목록 급수=Ⅰ |
| 5 | TOPIK Ⅱ | `count(... exam_level='II' AND status<>'cancelled')` | `applications.exam_level` | 목록 급수=Ⅱ |
| 6 | 환불·정정 대기 | `count(board_posts WHERE board_type='refund_correction' AND workflow_status='received')` | `board_posts.workflow_status` | 환불·정정 관리(답변없음) |
| 7 | 문의 답변 대기 | `count(board_posts WHERE board_type='inquiry' AND workflow_status='awaiting_reply')` | `board_posts.workflow_status` | 문의 관리(답변대기) |

- **정합성 규칙**: 카드 2·3의 분류는 [`bo-02-applications.md`](bo-02-applications.md) §3 상태머신과 동일 매핑을 사용. 카드 6·7 배지 정의는 사이드바 배지(`TPKM_BO_0_3_1`)와 동일 기준.
- 접근성: 라벨+값 텍스트 병행, 색상 단독 정보전달 금지.

### 2.3 최근 접수 표(5건) — `TPKM_BO_1_1_2_0_0_C`

| 항목 | 내용 |
| --- | --- |
| 개요 | 최근 접수 5건 미리보기. 컬럼: 번호 / 한글성명 / 급수(Ⅰ·Ⅱ) / 접수일 / 상태 칩 |
| 처리 | `applications` 회차 필터 + `created_at DESC LIMIT 5`, `users` 조인(성명) |
| 연동 API | `GET /admin/applications?exam_round_id=&page=1&page_size=5`(정렬 최신) |
| 연동 DB | `applications`, `users`(name_ko) |
| 후속 | “전체 보기” → `TPKM_BO_2_1`(접수자 목록) 패널 전환 |

> 보조 표(선택): 최근 환불·정정 / 최근 문의 각 3~5건 — `GET /admin/board/posts?board_type=...&page_size=5`.

---

## 3. 핵심 비즈니스 규칙

- **읽기 전용**: 대시보드는 어떤 상태도 변경하지 않는다(감사 로그 미생성).
- **단일 진실 공급원(SSOT)**: KPI·최근 목록·사이드바 배지·접수자 목록 카운트는 **모두 같은 집계 정의**를 공유해야 하며, 불일치 시 캐시 무효화(신규 접수/상태 변경 즉시) 정책으로 동기화.
- **회차 컨텍스트**: 기본은 활성 회차. select로 과거 회차 조회 시 전 카드·표가 함께 전환.

---

## 4. 타 서비스·FO 연동

| 연동 대상 | 연동 내용 | 비고 |
| --- | --- | --- |
| `bo-02-applications` | KPI 카드/최근 접수 → 필터 적용 진입 | `TPKM_BO_2_1` |
| `bo-04-content` | 환불·정정/문의 대기 카드 → 게시판 관리 진입 | `TPKM_BO_4_3`, `TPKM_BO_4_4` |
| `bo-03-exam` | 회차 select(활성 회차) | `exam_rounds` |
| `bo-00-common` 배지 | 동일 미처리 집계 기준 공유 | `TPKM_BO_0_3_1` |
| FO | 직접 연동 없음(BO 내부 집계) | — |

---

## 5. 운영 정책 합의 필요 항목

1. **대시보드 전용 집계 API**(`GET /admin/dashboard/summary`) 신설 여부 — 현재 미구현(클라이언트 산출).
2. KPI "검토 대기/승인 완료"의 **정확한 상태 포함 범위**(예: 환불자 포함 여부, 반려 제외 규칙) 확정.
3. 자동 갱신 방식·주기(폴링 30초 vs SSE/WebSocket) 및 캐시 TTL.
4. 회차 전환 select 노출 여부(기능정의서상 “향후” 표기) 및 기간 필터(오늘/7일/30일) 도입.
5. 향후 확장(추이 차트·To-Do 카드·CSV 내보내기) 우선순위.
