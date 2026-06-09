# TOPIK Myanmar — 합의 필요 항목 체크리스트 (시스템 설계 단계)

> **근거:** `docs/system_design/` 전체 — [overview.md](overview.md) · [database.md](database.md) · [tech-spec.md](tech-spec.md) · [services/](services) (FO/BO 14종)
> **작성일:** 2026-06-08 · **버전:** v1.0
> **성격:** 본 문서는 기존 [`docs/기능정의서/정책_합의_워크시트.md`](../기능정의서/정책_합의_워크시트.md) 와 **별개의 설계 단계 산출물**입니다. 워크시트(고객사 회신용)와 달리, 본 문서는 system_design 문서 전반에서 추출한 **정책 합의 · 정의서↔구현 정합화 · 미구현 결정 · 보안/운영 합의 · 다국어/콘텐츠 합의** 항목을 망라합니다.

## 표기 규약

| 표기 | 의미 |
| --- | --- |
| `[ ]` / `[x]` | 미결정(합의 대기) / 합의·반영 완료 |
| **우선순위** | `P0` = 출시 차단(접수 개시 전 필수) · `P1` = 중요(운영 정상화 필요) · `P2` = 개선(후속 가능) |
| **현재 상태** | 정의서/정책 내용 vs 실제 구현(또는 미정) 요약 |
| **결정/합의 필요** | 정해야 할 내용 + (불일치 항목은) 선택지 |

---

## 0. 요약

### 0.1 분류 × 우선순위 카운트

| 분류 | P0 | P1 | P2 | 합계 |
| --- | :---: | :---: | :---: | :---: |
| 1. 고객사 정책 합의 (비즈니스 결정) | 2 | 7 | 14 | 23 |
| 2. 정의서 ↔ 실제 구현 정합화 | 0 | 8 | 13 | 21 |
| 3. 미구현 기능 — 구현/보류 결정 | 0 | 9 | 21 | 30 |
| 4. 보안 · 인프라 · 운영 합의 | 3 | 5 | 9 | 17 |
| 5. 다국어 · 콘텐츠 운영 합의 | 0 | 1 | 9 | 10 |
| **합계** | **5** | **30** | **66** | **101** |

### 0.2 P0(출시 차단) 후보 — 5건

| # | 항목 | 분류 | 핵심 |
| --- | --- | --- | --- |
| P0-1 | 응시료 통화·금액 불일치 | 1 | 정책 MMK 50,000/75,000 ↔ 코드·seed `USD 25` |
| P0-2 | 제107회 시험장·지역 마스터 데이터 | 1 | seed 미포함(BO 등록 예정) — 없으면 접수 불가 |
| P0-3 | 도메인 구매·DNS·오픈일 | 4 | `topik-myanmar.com` 확정·미구매 |
| P0-4 | SMTP 발신 정보(실메일 발송) | 4 | 가입 인증 메일 발송 전제 |
| P0-5 | 약관·개인정보 법무 최종본 | 4 | 가입 시 동의 대상 — 임시본 출시 불가 |

---

## 1. 고객사 정책 합의 (비즈니스 결정)

| ☑ | 항목 | 현재 상태 | 결정/합의 필요 | 우선순위 | 관련 문서 |
| :---: | --- | --- | --- | :---: | --- |
| `[ ]` | **응시료 통화·금액** | 정책/워크시트 MMK 50,000(Ⅰ)/75,000(Ⅱ) ↔ 실제 seed·코드 `USD 25`(`${fee} USD`) | 통화 단위·최종 금액 확정 → seed/BO 회차 수정 + `rules-fee.html` 정적 문구 동기 | P0 | [database](database.md) §7.2·7.3 · [tech-spec](tech-spec.md) §8.2 · [fo-03](services/fo-03-topik-rules.md) |
| `[ ]` | **제107회 시험장·지역 목록** | seed 미포함, BO 등록 예정. FO STEP1 시험장 선택은 마스터 의존 | 1차 회차 시험장(지역·명칭·정원·2자리 코드) 확정·등록 | P0 | [database](database.md) §7.3 · [bo-03](services/bo-03-exam.md) · [fo-04](services/fo-04-topik-apply.md) |
| `[ ]` | **수험번호 공개 일시(`exam_number_visible_at`)** | 고객사 미확정, BO 입력값. 노출 게이팅에 사용 | FO 마이페이지 수험번호 노출 일·시각 확정 | P1 | [database](database.md) §7.3 · [bo-02](services/bo-02-applications.md) §2.7 · [fo-04](services/fo-04-topik-apply.md) §3.4 |
| `[ ]` | **합격자 발표일(`result_date`)** | 워크시트 "미정". 홈 타임라인 노출 | 발표일 확정 또는 "미정" 노출 범위 합의 | P1 | [tech-spec](tech-spec.md) §8.2 · [fo-01](services/fo-01-home.md) §2.4 |
| `[ ]` | **수납처 최종 안내 문구** | 미확정, FO 정적 반영 예정 | 납부 장소·계좌·운영시간·연락처 문구 확정 | P1 | 워크시트 §5 · [fo-03](services/fo-03-topik-rules.md) §2.3 |
| `[p]` | **Google 간편 가입·로그인 사용 여부** | API 구현 완료 (`POST /auth/google`). `GOOGLE_CLIENT_ID` 미설정 시 `enabled:false` | 사용 여부 결정 + Google Cloud 앱 등록·운영 env 설정 | P1 | [overview](overview.md) §6 · [fo-06](services/fo-06-account.md) §6 |
| `[ ]` | **FO 시험장 선택 방식** | 구현은 `exam_venue_id` 필수 입력(명시 선택), 동시·추가 접수 시 기존 venue 잠금 | "응시자 명시 선택" 유지 vs "자동 배정" 결정 | P1 | [fo-04](services/fo-04-topik-apply.md) §2.2.1·§5 |
| `[ ]` | **접수 취소·환불률·환불 SLA** | 취소는 수납 전까지만(0526), 수납 후 환불은 게시판 경유. 시점별 환불률 표 미정 | 시점별 환불 비율(접수 중/시험 임박/이후)·처리 SLA 확정 | P1 | [fo-03](services/fo-03-topik-rules.md) §5 · [fo-04](services/fo-04-topik-apply.md) §2.3.3 |
| `[ ]` | **가입 최소 연령** | 구현 `MIN_SIGNUP_AGE_YEARS=14` 강제(`AGE_RESTRICTED` 422), **정의서 미명시 신규 제약** | 최소 연령값·차단 정책 확정(또는 제약 해제) | P1 | [fo-06](services/fo-06-account.md) §6 · [tech-spec](tech-spec.md) §7.1 |
| `[ ]` | **1인 다회/타 회차 중복 접수 범위** | 동일 회차 Ⅰ+Ⅱ 허용, 그 외 명문화 안 됨 | 다회/타 회차 동시 접수 허용 범위 확정 | P2 | [fo-04](services/fo-04-topik-apply.md) §5 |
| `[ ]` | **임시저장(draft) 만료기간** | 구현 30일(V005, 회원당 1건) | 만료기간 확정(회차 접수기간 정렬 권장) | P2 | [fo-04](services/fo-04-topik-apply.md) §2.2·§5 · [database](database.md) §4.19 |
| `[ ]` | **D-Day 카운트다운 기준** | 구현은 `registration_end_at`(접수 마감일시) 채택 | 접수 마감일시 vs 시험일 기준 확정 | P2 | [fo-01](services/fo-01-home.md) §2.2·§5 |
| `[ ]` | **부정행위 후 재응시 제한 기간** | 미정(NIIED 안내문 정합 필요) | 재응시 제한 기간 확정 | P2 | [fo-03](services/fo-03-topik-rules.md) §5 |
| `[ ]` | **신분증 미소지·만료 시 대체 확인 절차** | 미정 | 대체 확인 절차 확정 | P2 | [fo-03](services/fo-03-topik-rules.md) §5 |
| `[ ]` | **수험번호 부여 후 취소 시 코드 재사용** | 미정(환불 시 번호 유지 정책만 확정) | 취소 좌석/코드 재사용·공석 운영 방식 확정 | P2 | [fo-03](services/fo-03-topik-rules.md) §5 · [fo-04](services/fo-04-topik-apply.md) §5 |
| `[ ]` | **접수 확인증 개인정보 노출 범위** | 클라이언트 인쇄(서버 Receipt 없음) | 인쇄물 노출 필드 범위 확정 | P2 | [fo-04](services/fo-04-topik-apply.md) §2.3.2·§5 |
| `[ ]` | **정원 초과(`ignore_capacity`) 운영 기준** | 수납 시 정원 검증 우회 가능(운영 재량) | 정원 초과 허용 기준·대기열 정책 확정 | P2 | [bo-02](services/bo-02-applications.md) §2.3.1·§5 · [bo-03](services/bo-03-exam.md) §5 |
| `[ ]` | **비밀번호 6개월 경과 시 강제 변경 vs 안내** | 구현은 권고 메일(180일·쿨다운 30일) | 강제 변경 팝업 vs 안내 유지 결정 | P2 | [fo-06](services/fo-06-account.md) §2.2.2·§5 |
| `[ ]` | **운영·긴급 연락처** | 미정 | 대표·긴급 연락처 확정(푸터·안내 반영) | P2 | 워크시트 §6 · [fo-00](services/fo-00-common.md) §2.5 |
| `[ ]` | **환불·정정/문의 처리 SLA·표준 템플릿** | 미정 | 접수→검토→완료 표준 일수·답변 템플릿 합의 | P2 | [fo-05](services/fo-05-board.md) §5 · [bo-04](services/bo-04-content.md) §5 |
| `[ ]` | **비밀글 비밀번호 분실 복구 절차** | 미정(5회 실패 30분 잠금만) | 분실 시 복구·재설정 절차 확정 | P2 | [fo-05](services/fo-05-board.md) §5 |
| `[ ]` | **게시판 글 수정/삭제 허용 시점(정책)** | 정의서 "답변 전 가능", FO API 미구현(§3 연계) | 수정/삭제 가능 시점 정책 확정(작성 후 24h/답변 전 등) | P2 | [fo-05](services/fo-05-board.md) §5 |
| `[ ]` | **복수 계정(일반+구글) 허용 여부** | 미정(찾기 결과 분기 UX 영향) | 동일인 복수 계정 허용 여부·결과 화면 UX 확정 | P2 | [fo-06](services/fo-06-account.md) §5 |

---

## 2. 정의서 ↔ 실제 구현 정합화 (어느 쪽으로 맞출지 결정)

> 각 항목은 "정의서대로 구현 변경" vs "구현 유지·정의서 수정" 중 택일이 필요합니다. database.md §7.2는 대부분 **실제 구현 우선**으로 정리했으나, 정본(기능정의서/REST 초안) 문서 갱신·일부 제약 추가는 미결입니다.

| ☑ | 항목 | 현재 상태(정의서 ↔ 구현) | 결정/합의 필요 | 우선순위 | 관련 문서 |
| :---: | --- | --- | --- | :---: | --- |
| `[ ]` | **약관 동의 테이블명** | 초안 `term_agreements`(컬럼 `agreed_at`/`user_agent`) ↔ 실제 `terms_consents`(`created_at`, user_agent 없음, term_type/version 비정규화) | 정본 명칭·컬럼을 실제로 갱신 vs 구현 보강 | P1 | [database](database.md) §4.14·7.2 · [bo-05](services/bo-05-members-terms.md) §2.9 · [fo-06](services/fo-06-account.md) §6 |
| `[ ]` | **감사로그 컬럼명** | 초안 `action`/`target_table`/`status_before`/`payload` ↔ 실제 `action_type`/`target_type`/`before_data`/`after_data`/`ip_address` | 정본 스키마를 실제로 갱신(권장) | P1 | [database](database.md) §4.10·7.2 · [bo-06](services/bo-06-system.md) §2.3 |
| `[ ]` | **관리자 권한 enum** | 초안 `super/standard/readonly` ↔ 실제 `super/admin/readonly`(`_normalize_admin_role` 정규화) | 표기 일원화(문서 `admin`로 통일 권장) | P1 | [overview](overview.md) §2 · [database](database.md) §3.2 · [bo-00](services/bo-00-common.md) §1·§5 |
| `[ ]` | **`profile_snapshot`·`terms_snapshot` 미보관** | 초안 `applications.profile_snapshot`/`application_submissions.terms_snapshot` JSONB ↔ 실제 없음(`users` 직접 조인) | 스냅샷 도입 여부(정정 시 과거 접수 표기 영향) | P1 | [database](database.md) §4.6·4.7·7.2 · [fo-04](services/fo-04-topik-apply.md) §6 |
| `[ ]` | **`exam_number`·`application_no` 유일성** | 초안 UNIQUE ↔ 실제 DB UNIQUE 없음(앱 검증·채번 로직 의존), `application_no` 형식 `APP-{submission_id}-{level}` | 부분 유니크 인덱스 추가 vs 앱 검증 유지 | P1 | [database](database.md) §4.7·7.2·7.3 · [fo-04](services/fo-04-topik-apply.md) §6 |
| `[ ]` | **낙관적 잠금 `rev` 적용 범위** | 초안 `exam_rounds`/`exam_venues`/`admin_users`에도 `rev` ↔ 실제 `users`·`applications`만 | 마스터/계정 동시편집 대비 `rev`(또는 updated_at) 추가 여부 | P1 | [overview](overview.md) §7.2 · [database](database.md) §1·7.2 · [bo-00](services/bo-00-common.md) §3.3 · [bo-03](services/bo-03-exam.md) §5 |
| `[ ]` | **REST 경로 다수 상이** | 초안 `/auth/signup`·`/auth/email/verify/*`·`/me/password`·`.../exam-numbers/assign`·`/exam-rounds/{id}/venues`·`/admin/auth/login`·비동기 Job ↔ 실제 `/auth/register`·`/auth/send-verification-code`·`/auth/verify-email`·`/me/change-password`·`/assign-exam-numbers`·`/exam-venues`·공용 `/auth/login`·동기 스트리밍 | REST 명세 초안을 실제 경로로 갱신(권장) | P1 | [tech-spec](tech-spec.md) §4.2 · [fo-04](services/fo-04-topik-apply.md) §6 · [fo-06](services/fo-06-account.md) §6 |
| `[ ]` | **연명부 엑셀 사양** | 정의서 11컬럼·코드명·파일명 `제{회차}회…({국가}_{시험장}).xlsx`·비동기 Job ↔ 실제 10열·코드값·`TOPIK_미얀마_연명부_제{n}회.zip`·동기 스트리밍 | 컬럼 수/코드vs코드명/파일명/동기·비동기·마스킹 확정 | P1 | [bo-02](services/bo-02-applications.md) §2.8·§5 |
| `[ ]` | **`applications.reject_code`+`reject_note`** | 초안 코드+노트 2컬럼 ↔ 실제 `reject_reason`(단일 Text) | 단일 컬럼 유지 vs 코드 분리 복원 | P2 | [database](database.md) §4.7·7.2 · [fo-04](services/fo-04-topik-apply.md) §6 |
| `[ ]` | **`receipt_no` 명칭** | 초안 `receipt_no` ↔ 실제 `payment_receipt_no` | 명칭 통일 | P2 | [database](database.md) §4.7 · [fo-03](services/fo-03-topik-rules.md) §2.3 · [fo-04](services/fo-04-topik-apply.md) §6 |
| `[ ]` | **`result_announcement_date` 명칭** | 초안 `result_announcement_date` ↔ 실제 `result_date`(직렬화 시 양쪽 키) | 명칭 통일(직렬화 alias 유지 여부) | P2 | [database](database.md) §4.2·7.2 · [fo-01](services/fo-01-home.md) §5 |
| `[ ]` | **`admin_users.is_active` ↔ `status`** | 초안 `is_active`(boolean) ↔ 실제 `status`(active/inactive 문자열) | 표기·타입 통일 | P2 | [database](database.md) §3.2·4.9 · [bo-06](services/bo-06-system.md) §5 |
| `[ ]` | **응시료 타입** | 초안 `DECIMAL(12,2)` ↔ 실제 `INTEGER`(소수점 미사용) | Integer 유지 vs Decimal(통화 결정과 연계) | P2 | [database](database.md) §4.2·7.2 · [bo-03](services/bo-03-exam.md) §2.1.1·§5 |
| `[ ]` | **`exam_venues` UNIQUE 범위** | 초안 전역 `UNIQUE(venue_code)` ↔ 실제 지역별 `(country,region,venue_code)`(V006) | 유니크 범위 확정(채번 ④코드 중복 영향 분석) | P2 | [database](database.md) §4.4·7.2 · [bo-03](services/bo-03-exam.md) §2.2.1·§5 |
| `[ ]` | **`registration_status` enum** | 초안 3종(scheduled/open/closed) ↔ 실제 4종(`revoked` 폐지 포함) | 정본 enum 문서화(4종 확정) | P2 | [database](database.md) §3.2 · [bo-03](services/bo-03-exam.md) §2.1.3·§5 |
| `[ ]` | **`email_outbox` 구조** | 초안 `subject`/`body_html`/`related_*` ↔ 실제 `variables`(발송 시 렌더)+`retry_*`/`last_error` | 정본 스키마 갱신 | P2 | [database](database.md) §4.18·7.2 |
| `[ ]` | **`users.provider_uid` ↔ `google_sub`** | 초안 `provider_uid` ↔ 실제 `google_sub` | 명칭 통일 | P2 | [database](database.md) §4.1·7.2 · [fo-06](services/fo-06-account.md) §4 |
| `[ ]` | **`terms.effective_at` 타입** | 초안 TIMESTAMPTZ ↔ 실제 DATE | 타입 확정(예약 게시 정밀도 연계) | P2 | [database](database.md) §4.13·7.2 |
| `[ ]` | **사진 zip 누락 리포트 형식** | 정의서 `누락_리포트.xlsx`(성명/수험번호/사유) ↔ 실제 `_누락리포트.txt` | 형식 확정(.txt vs .xlsx) | P2 | [bo-02](services/bo-02-applications.md) §2.9·§5 |
| `[ ]` | **사진 반려 시 `status` 값** | 구현은 `status→photo_review`(재심사 루프) ↔ 초안 정의(제출 직후 사진심사중)와 의미 차이 | `photo_review` 의미 재정의·문서화 | P2 | [bo-02](services/bo-02-applications.md) §2.2·§5 |
| `[ ]` | **`GET /me` 만료 필드** | 초안 응답 `password_change_due` ↔ 실제 `password_changed_at`(FE 계산) | 응답 필드 계약 확정 | P2 | [fo-06](services/fo-06-account.md) §6 |

---

## 3. 미구현 기능 — 구현/보류 결정

| ☑ | 항목 | 현재 상태 | 결정/합의 필요 | 우선순위 | 관련 문서 |
| :---: | --- | --- | --- | :---: | --- |
| `[ ]` | **수험번호 채번 원자성(`exam_number_sequences`)** | 초안 시퀀스 테이블+`FOR UPDATE` ↔ 실제 단일 트랜잭션 in-memory 배치(super 단독·재배정 가드만) | 동시 최초 부여 경합 방지(advisory lock 또는 시퀀스 도입) 여부 | P1 | [database](database.md) §1·5.2·7.2 · [bo-02](services/bo-02-applications.md) §2.7·§5 |
| `[ ]` | **서버 세션/강제 로그아웃(`user_sessions`)** | 미구현 — 무상태 JWT(로그아웃은 클라 토큰 폐기) | 무상태 유지 vs 세션 테이블·블랙리스트 도입(즉시 강제 로그아웃) | P1 | [database](database.md) §1·7.2 · [fo-00](services/fo-00-common.md) §5 · [bo-00](services/bo-00-common.md) §2.2·§5 |
| `[ ]` | **첨부 다운로드 권한 점검** | `GET /files/{id}`는 user_photo/application_photo 본인·관리자만 → **공개 공지/게시판 첨부가 비관리자에게 403 가능** | 공개 공지 첨부 접근 보장(권한 분기) 점검·보강 | P1 | [fo-05](services/fo-05-board.md) §5 · [database](database.md) §4.17 |
| `[ ]` | **내정보 이메일 변경** | `PATCH /me` 본문에 email 필드 없음 → 변경 미지원(정의서는 가능) | 이메일 변경 지원 여부·중복 검증·재인증 절차 | P1 | [fo-06](services/fo-06-account.md) §2.3·§6 |
| `[ ]` | **회원 목록 필터·검색·페이지네이션** | 현재 최근 200건·무필터 | 서버 필터(상태/가입일/국적/검색)·페이징 구현 | P1 | [bo-05](services/bo-05-members-terms.md) §2.1·§5 |
| `[ ]` | **대시보드 요약·배지 집계 API** | `GET /admin/dashboard/summary`·badges 미구현(클라가 목록 API로 산출) | 전용 집계 API 신설 여부(SSOT·캐시) | P1 | [bo-01](services/bo-01-dashboard.md) §2.1·§5 · [bo-00](services/bo-00-common.md) §2.5 |
| `[ ]` | **처리 이력 필터·CSV·가시성 RBAC** | 현재 200건 무필터, 전 등급 전체 열람. 필터·CSV·페이징·본인 이력 제한 미구현 | 필터/CSV(super)/페이징 + admin·readonly 본인 이력만 제한 구현 | P1 | [bo-06](services/bo-06-system.md) §2.3·§5 · [bo-00](services/bo-00-common.md) §5 |
| `[ ]` | **약관 예약 게시·강제 재동의** | 즉시 게시만, `effective_at` 자동 게시·재동의 흐름 미구현 | 예약 게시·개정 시 강제 재동의(거부 시 이용 제한) 구현 | P1 | [bo-05](services/bo-05-members-terms.md) §2.8·§5 · [fo-06](services/fo-06-account.md) §5 |
| `[ ]` | **마케팅 메일 발송 방식** | 정의서(0527) "신규 게시 시 자동 일괄" ↔ 실제 관리자 수동 트리거(`send-marketing`, 배치 상한 500) | 자동/수동·예약 발송·발신자(From)·500건 초과 분할 확정 | P1 | [bo-04](services/bo-04-content.md) §2.1.4·§5 · [tech-spec](tech-spec.md) §5.2 |
| `[ ]` | **공지 조회수 dedup(`notice_view_logs`)** | 미구현 — 매 호출 `view_count += 1`(1회/세션 dedup 아님) | 세션 dedup 적용 여부(로그 테이블 도입) | P2 | [fo-01](services/fo-01-home.md) §3.2 · [fo-05](services/fo-05-board.md) §5 · [database](database.md) §4.11 |
| `[ ]` | **게시판 본인 글 수정/삭제 FO API** | `PATCH/DELETE /board/posts/{id}` 미구현(정의서는 답변 전 가능) | FO 수정/삭제 API 신설 여부(정책 §1과 연계) | P2 | [fo-05](services/fo-05-board.md) §2.2.3·§5 |
| `[ ]` | **비밀글 잠금 단위** | 게시글 단위 카운터(구현) ↔ 정의서 IP+계정 단위 | 잠금 단위 확정 | P2 | [fo-05](services/fo-05-board.md) §2.2.4·§5 |
| `[ ]` | **비밀글 댓글 자동 비밀처리·공개/비공개 옵션** | `board_comments.is_secret` 모델 존재하나 자동 설정 미구현, 일반글 댓글 공개/비공개 옵션 미구현 | 자동 비밀처리·댓글 공개범위 옵션 구현 여부 | P2 | [fo-05](services/fo-05-board.md) §2.2.3·§5 |
| `[ ]` | **비밀글 비밀번호 필수/선택** | 구현은 선택(미설정 시 작성자·관리자만, unlock 불가) ↔ 정의서 4자+ 필수 | 필수화 여부 확정 | P2 | [fo-05](services/fo-05-board.md) §5 |
| `[ ]` | **공지/FAQ 삭제 API** | 미구현(`is_published`/`is_active=false` 비노출만) | soft-delete(휴지통) 신설 여부 | P2 | [bo-04](services/bo-04-content.md) §2.1.3·2.2·§5 |
| `[ ]` | **게시글 삭제 정책** | 환불·정정/문의 글 hard delete(즉시) | soft-delete + 30일 보존 도입 여부 | P2 | [bo-04](services/bo-04-content.md) §2.3.3·§5 |
| `[ ]` | **회원 CSV/엑셀 내보내기** | 미구현(약관 동의 이력 CSV만 존재) | 신설 여부 + 개인정보 마스킹 기본값 | P2 | [bo-05](services/bo-05-members-terms.md) §2.5·§5 |
| `[ ]` | **회원 상세 통합 API** | `GET /admin/users/{id}`(접수/처리 이력 포함) 미구현 | 통합 상세 API 신설 여부 | P2 | [bo-05](services/bo-05-members-terms.md) §2.2·§5 |
| `[ ]` | **권한 매트릭스 DB화** | RBAC 코드 하드코딩 3등급 고정, `permissions.jsx`는 표시 프로토타입 | 세밀 RBAC(역할/메뉴 커스터마이징) DB화 시점 | P2 | [bo-06](services/bo-06-system.md) §2.2·§5 |
| `[ ]` | **관리자 메모 작성 API** | 상세는 메모 읽기만, `POST /admin/applications/{id}/memos` 미구현 | 메모 작성 API 신설 여부 | P2 | [bo-02](services/bo-02-applications.md) §2.6 |
| `[ ]` | **`GET /admin/me`** | 미구현(로그인 응답 프로필을 클라가 보관) | 전용 프로필 조회 API 신설 여부 | P2 | [bo-00](services/bo-00-common.md) §2.4·§5 |
| `[ ]` | **회원 비밀번호 초기화 후 강제 변경** | `users.must_change_password` 없음 → 다음 로그인 강제 변경 미구현(관리자 계정만 보유) | 플래그 도입·임시토큰 1회용/만료 정책 | P2 | [bo-05](services/bo-05-members-terms.md) §2.6·§5 |
| `[ ]` | **게시판 댓글·대댓글 이메일 알림** | 답변(reply)만 발송, 댓글 상대방 알림 미구현(0526 요구) | 댓글 알림 구현 여부 | P2 | [bo-04](services/bo-04-content.md) §2.3.2·§5 |
| `[ ]` | **정보정정 "직접 반영" 버튼** | 회원 데이터 즉시 갱신 버튼 미구현(`bo-05` 회원 수정 수동 연동) | 직접 반영 기능 구현 범위·권한 | P2 | [bo-04](services/bo-04-content.md) §2.3.2·§5 |
| `[ ]` | **접수 확인증 Receipt API(`GET /applications/{id}/receipt`)** | 미구현(클라이언트 인쇄) | 서버 PDF/Receipt 발급 필요 여부 | P2 | [fo-04](services/fo-04-topik-apply.md) §2.3.2·§6 |
| `[ ]` | **수납 취소(환불) 가드** | 취소 사유 필수·`rev` 가드·`payment_cancel_reason` 저장 미적용(정의서는 사유 필수) | 사유 필수·rev 가드 추가, endpoint 명칭(`payment/cancel` vs `refund`) 통일 | P2 | [bo-02](services/bo-02-applications.md) §2.3.2·§5 |
| `[ ]` | **반려/승인 서버 가드** | 반려 사유 서버 필수 미적용, 승인 시 사진 미심사 차단 미강제 | 반려 사유 서버 필수화·승인 사진 가드 서버 강제 여부 | P2 | [bo-02](services/bo-02-applications.md) §2.4·2.5·§5 |
| `[ ]` | **의미 검색 / RAG(`semantic_chunks`)** | 스키마만 준비(`SEMANTIC_SEARCH_ENABLED=false`), 임베딩·검색 API 후속 | 활성화 시점·범위(FAQ/공지 검색·챗봇) 결정 | P2 | [database](database.md) §4.20 · [tech-spec](tech-spec.md) §8.1 |
| `[ ]` | **`apps/web`(Vite+React) 이전** | 스캐폴드(홈 placeholder), 운영 화면은 정적 HTML | FO/BO 화면 이전 시점(중기) 결정 | P2 | [tech-spec](tech-spec.md) §1·§8.1 |
| `[ ]` | **`/internal/notifications/*`** | 레거시 계약, 미등록 | 등록·폐기 결정 | P2 | [tech-spec](tech-spec.md) §8.1 |

---

## 4. 보안 · 인프라 · 운영 합의

| ☑ | 항목 | 현재 상태 | 결정/합의 필요 | 우선순위 | 관련 문서 |
| :---: | --- | --- | --- | :---: | --- |
| `[ ]` | **도메인 구매·DNS·오픈일** | `topik-myanmar.com` 확정·미구매 | 구매·DNS 담당·오픈 목표일 확정 | P0 | [tech-spec](tech-spec.md) §8.2 · [overview](overview.md) §6 · 워크시트 §1 |
| `[ ]` | **SMTP 발신 정보** | 도메인·DNS(MX/SPF/DKIM) 확정 후 실발송. 현재 `console`/큐 | 발신 주소·표시명·회신 주소 확정(실메일 발송) | P0 | [tech-spec](tech-spec.md) §5.2·§8.2 · 워크시트 §2 |
| `[ ]` | **약관·개인정보 법무 최종본** | 임시 `terms`, 가입 시 동의 대상 | 법무 검토 완료본 제공 → `terms` 교체 | P0 | [tech-spec](tech-spec.md) §8.2 · 워크시트 §7 · [bo-05](services/bo-05-members-terms.md) §2.7 |
| `[ ]` | **개인정보 추가 암호화·보존 기간** | 비밀번호만 해시, 여권번호 미수집. 생년월일 등 추가 암호화 미정 | 추가 암호화 대상·감사로그/개인정보 보존 기간 확정 | P1 | [database](database.md) §1·7.3 · [overview](overview.md) §7.3 · [bo-05](services/bo-05-members-terms.md) §3.3 |
| `[ ]` | **백업 RTO/RPO** | DB VPS 일 1회 `pg_dump` cron만, RTO/RPO 미확정 | 복구 목표(RTO/RPO)·이중화 정책 확정 | P1 | [tech-spec](tech-spec.md) §6.2 · [database](database.md) §7.3 |
| `[ ]` | **무상태 JWT 강제 로그아웃·세션 즉시 무효화** | 비활성/권한 변경은 다음 요청에서 차단(즉시 무효화 아님) | 블랙리스트/세션 테이블(§3) 도입으로 즉시 무효화 여부 | P1 | [bo-00](services/bo-00-common.md) §2.2·§5 · [bo-06](services/bo-06-system.md) §5 |
| `[ ]` | **감사 로그 보존 기간·무결성** | append-only 권고, 보존 3년 권고(기능정의서 1년 이상) | 보존 기간(3년/5년)·append-only 보장(트리거/권한) 확정 | P1 | [bo-06](services/bo-06-system.md) §3.2·§5 · [bo-02](services/bo-02-applications.md) §3.3 |
| `[ ]` | **회원 정보수정·약관 등록/수정 권한 등급** | 구현은 `admin` 허용 ↔ 기능정의서 `super` 권고 | super vs admin 권한 등급 확정 | P1 | [bo-00](services/bo-00-common.md) §3.2·§5 · [bo-05](services/bo-05-members-terms.md) §5 |
| `[ ]` | **세션 만료 정책 최종값** | JWT exp 기반(access 60분/refresh 14일). 유휴 타임아웃 미적용 | 유휴 30분/절대 8시간 등 최종값 확정 | P2 | [bo-00](services/bo-00-common.md) §2.3·§5 |
| `[ ]` | **로그인 잠금 IP 단위 병행** | 계정 단위 5회/30분만 | IP 단위 병행·잠금 알림 도입 여부 | P2 | [bo-00](services/bo-00-common.md) §2.1·§5 |
| `[ ]` | **2FA·IP 화이트리스트·CSP/CSRF** | 미도입 | 도입 시점·운영 헤더 최종안 | P2 | [bo-00](services/bo-00-common.md) §5 · [bo-06](services/bo-06-system.md) §5 |
| `[ ]` | **마지막 로그인 IP 표기** | `last_login_at`만 저장, IP 별도 미저장 | 목록 IP 컬럼 데이터 소스 확보 여부 | P2 | [bo-06](services/bo-06-system.md) §5 |
| `[ ]` | **대량 조회용 추가 인덱스** | `users` `name_en`/`status,created_at` 등 초안 인덱스 미정의 | 대량 데이터 대비 인덱스 추가 검토 | P2 | [database](database.md) §4.1 · [tech-spec](tech-spec.md) §6.2 |
| `[ ]` | **정지/탈퇴 사유 저장·세션 즉시 무효화** | 사유 텍스트 컬럼 미사용(cascade reason만), 즉시 무효화 부분 적용 | 사유 저장·활성 세션 즉시 무효화 보강 | P2 | [bo-05](services/bo-05-members-terms.md) §2.4·§5 |
| `[ ]` | **"로그인 상태 유지" 토큰 기간·refresh rotation** | 미정(계정 06 §5에서 30일 제안), rotation 미적용 | 유효기간·refresh 회전/블랙리스트 정책 확정 | P2 | [fo-00](services/fo-00-common.md) §3.3·§5 · [fo-06](services/fo-06-account.md) §5 |
| `[ ]` | **아이디/비번 찾기 조회 제한** | rate limit 미적용(권장) | 연속 실패 시 재시도 제한·마스킹 정책 확정 | P2 | [fo-06](services/fo-06-account.md) §2.1.2·§5 |
| `[ ]` | **비밀글 본문 열람 권한 등급·이력 보존** | admin↑ 즉시 열람(`board_secret_view` 기록) | 열람 권한 등급(super vs admin)·열람 이력 보존기간 확정 | P2 | [bo-04](services/bo-04-content.md) §3.2·§5 |

---

## 5. 다국어 · 콘텐츠 운영 합의

| ☑ | 항목 | 현재 상태 | 결정/합의 필요 | 우선순위 | 관련 문서 |
| :---: | --- | --- | --- | :---: | --- |
| `[ ]` | **공지 본문 다국어** | `notices.body_html` KO 단일(FO 언어별 본문 미구현) | 언어별 본문 도입 여부·운영 방식 | P1 | [overview](overview.md) §7.1 · [tech-spec](tech-spec.md) §6.2·§8.1 · [database](database.md) §4.11 |
| `[ ]` | **다국어 폴백 체인(서버측 EN 중간 폴백)** | 클라 i18n은 MY→EN→KO, 서버 콘텐츠 API는 선택언어→KO 직접 폴백 | 서버측도 EN 중간 폴백 적용 여부 | P2 | [fo-00](services/fo-00-common.md) §2.2·§5 |
| `[ ]` | **FAQ 다국어 필수/선택** | 구현 MY/EN nullable ↔ 기능정의서 동시 필수 | KO 필수·MY/EN 필수 vs 선택 확정 | P2 | [bo-04](services/bo-04-content.md) §2.2·§5 · [fo-05](services/fo-05-board.md) §5 |
| `[ ]` | **미얀마어 번역·폰트 검수** | 운영자 번역(자동 번역 금지), Padauk/Pyidaungsu | 번역·폰트 검수 주체·SLA 확정 | P2 | [fo-00](services/fo-00-common.md) §5 · [fo-02](services/fo-02-topik-guide.md) §5 |
| `[ ]` | **안내·규정 콘텐츠 갱신 SLA** | 정적/i18n, NIIED 기준 동기화 운영자 의존 | 갱신 주기·책임자·NIIED 동기화 SLA 확정 | P2 | [fo-02](services/fo-02-topik-guide.md) §3·§5 · [fo-03](services/fo-03-topik-rules.md) §5 |
| `[ ]` | **수험표 안내(`ticket.html`) 다국어 제공** | 0527 외부 안내 페이지, 다국어 여부 미정 | 다국어 제공 여부 확정 | P2 | [fo-04](services/fo-04-topik-apply.md) §2.4·§5 |
| `[ ]` | **FAQ 답변 공개/비공개 기본값·표준 템플릿** | 미정 | 기본 공개범위·표준 답변 템플릿 확정 | P2 | [bo-04](services/bo-04-content.md) §5 |
| `[ ]` | **운영 주체 표기(대사관 vs NIIED) 문구** | 혼용 가능 | 표기 문구 통일 | P2 | [fo-02](services/fo-02-topik-guide.md) §5 · [fo-00](services/fo-00-common.md) §2.5 |
| `[ ]` | **홈 노출 구성** | 공지 미리보기 5건 고정, 퀵링크·타임라인 회차 범위 미정 | 공지 건수·퀵링크 구성·타임라인 노출 회차 범위 확정 | P2 | [fo-01](services/fo-01-home.md) §5 |
| `[ ]` | **안내·규정 BO 본문 관리 도입** | 현재 정적/i18n, BO 본문 관리 미착수(IA v1.1) | 도입 여부·시점 결정 | P2 | [fo-02](services/fo-02-topik-guide.md) §3·§5 |

---

> **사용 안내:** 합의·결정이 완료된 항목은 `[ ]` → `[x]`로 표시하고, 반영 위치(코드/마이그레이션/정의서/정적 문구)를 PR 또는 커밋에 링크하세요. 정의서↔구현 정합화(§2) 항목은 결정 후 `docs/기능정의서/` 정본 또는 `apps/api`/`db/migrations` 중 한쪽을 갱신해 차이를 0으로 수렴시키는 것이 목표입니다.
