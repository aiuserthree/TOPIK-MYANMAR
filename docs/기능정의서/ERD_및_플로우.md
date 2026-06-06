# TOPIK Myanmar — ERD 및 시퀀스 플로우 (v0.1)

> **목적**: V001 스키마·REST API·0527 정책을 한눈에 보는 **관계도(ERD)** 와 핵심 **시퀀스 다이어그램**. 백엔드·QA·온보딩용.  
> **근거**: `db/migrations/V001__initial_schema.sql`, `DB스키마_초안.md`, `REST_API_명세_초안.md`, `FO/04_TOPIK접수_기능정의서.md`, `BO/02_접수관리_기능정의서.md`  
> **UI**: C안 확정, 프로토타입 localStorage → 프로덕션 API (`REST_API_명세_초안.md` §6)

---

## A) ERD (핵심 엔티티)

`V001` 기준. 보조 테이블(`user_sessions`, `email_verification_codes` 등)은 ERD에서 생략.

```mermaid
erDiagram
  country_region_codes ||--o{ exam_venues : region
  exam_rounds ||--o{ exam_round_venues : offers
  exam_venues ||--o{ exam_round_venues : linked
  users ||--o{ application_submissions : submits
  exam_rounds ||--o{ application_submissions : round
  application_submissions ||--|{ applications : "1-2 rows I II"
  users ||--o{ applications : owner
  exam_rounds ||--o{ applications : round
  exam_venues ||--o{ applications : venue
  users }o--o| file_attachments : profile_photo
  applications }o--o| file_attachments : snapshot_photo
  exam_rounds ||--o{ exam_number_sequences : serial_pool
  exam_venues ||--o{ exam_number_sequences : serial_pool
  admin_users ||--o{ admin_audit_logs : performs
  admin_users ||--o{ notices : authors
  users ||--o{ board_posts : writes
  board_posts ||--o{ board_comments : has
  admin_users ||--o{ board_comments : staff_reply
  terms ||--o{ term_agreements : version
  users ||--o{ term_agreements : agrees
  email_outbox }o--o| users : optional_recipient

  users {
    bigserial id PK
    varchar email UK
    varchar name_ko
    varchar name_en
    char birth_date
    char gender
    bigint photo_file_id FK
    varchar status
    int rev
  }

  exam_rounds {
    bigserial id PK
    smallint round_no UK
    date exam_date
    timestamptz registration_end_at
    decimal fee_level_i
    decimal fee_level_ii
    varchar registration_status
    timestamptz exam_number_visible_at
  }

  country_region_codes {
    char country_code PK
    char region_code PK
    varchar name_ko
  }

  exam_venues {
    bigserial id PK
    char venue_code UK
    char country_code FK
    char region_code FK
    int capacity
    boolean is_active
  }

  exam_round_venues {
    bigint exam_round_id PK
    bigint exam_venue_id PK
  }

  application_submissions {
    bigserial id PK
    bigint user_id FK
    bigint exam_round_id FK
    timestamptz submitted_at
    jsonb terms_snapshot
  }

  applications {
    bigserial id PK
    bigint submission_id FK
    bigint user_id FK
    bigint exam_round_id FK
    varchar exam_level
    bigint exam_venue_id FK
    varchar application_no UK
    char exam_number UK
    varchar status
    varchar photo_review_status
    varchar payment_status
    jsonb profile_snapshot
    bigint photo_file_id FK
    int rev
  }

  exam_number_sequences {
    bigint exam_round_id PK
    bigint exam_venue_id PK
    varchar exam_level PK
    int last_serial
  }

  admin_users {
    bigserial id PK
    varchar email UK
    varchar role
    boolean is_active
    int rev
  }

  admin_audit_logs {
    bigserial id PK
    bigint admin_user_id FK
    varchar target_table
    bigint target_id
    varchar action
    varchar status_before
    varchar status_after
    jsonb payload
  }

  notices {
    bigserial id PK
    varchar category
    varchar title
    boolean is_published
    bigint author_admin_id FK
  }

  board_posts {
    bigserial id PK
    varchar board_type
    bigint user_id FK
    varchar workflow_status
    boolean is_secret
  }

  board_comments {
    bigserial id PK
    bigint board_post_id FK
    bigint parent_comment_id FK
    bigint author_user_id FK
    bigint author_admin_id FK
  }

  faq_items {
    bigserial id PK
    varchar category
    int sort_order
    boolean is_active
  }

  terms {
    bigserial id PK
    varchar term_type
    varchar version
    varchar status
  }

  term_agreements {
    bigserial id PK
    bigint user_id FK
    bigint term_id FK
    timestamptz agreed_at
  }

  file_attachments {
    bigserial id PK
    varchar owner_type
    bigint owner_id
    varchar storage_key
    varchar mime_type
  }

  email_outbox {
    bigserial id PK
    varchar template_key
    char locale
    varchar to_email
    bigint user_id FK
    varchar status
    varchar related_table
    bigint related_id
  }
```

### A.1 동시 접수(Ⅰ+Ⅱ) — 데이터 모델

| 규칙 | 구현 |
| --- | --- |
| 1회차 1그룹 | `application_submissions` `UNIQUE(user_id, exam_round_id)` |
| 급수별 행 | `exam_levels: ["I","II"]` → `applications` **2행**, 동일 `submission_id` |
| 동일 시험장 | 2행 모두 동일 `exam_venue_id` (수험번호 ④ `venue_code` 동일) |
| 수준 코드 | Ⅰ→`7`, Ⅱ→`8` (13자리 ③만 상이) |
| 응시료 | `exam_rounds.fee_level_i` / `fee_level_ii` (**MMK**), **오프라인 개별 수납** (급수별) |

### A.2 상태 축 (`applications`)

| 축 | 값 | FO 배지 연동 |
| --- | --- | --- |
| `status` | submitted → photo_review → payment_pending → approved → exam_number_assigned / rejected / cancelled | `GET /applications` `display_status` |
| `photo_review_status` | pending / approved / rejected | 사진심사중·반려 |
| `payment_status` | unpaid / paid / refunded | 수납대기·환불자(BO) |

---

## B) 시퀀스 다이어그램

### B.1 FO 접수 제출 (4단계 → submission + applications)

**언제 보나**: FO `register.html` STEP4 제출, API 연동 설계·통합 테스트, localStorage `topik_mm_reglist_v1` → 서버 이관 검증.

**정책**: 접수 완료 **이메일 없음**(0527). 초기 `payment_status=unpaid`(오프라인 MMK). 사진은 가입 시 `users.photo_file_id` 스냅샷.

```mermaid
sequenceDiagram
  autonumber
  participant FO as FO Client
  participant API as API v1
  participant DB as PostgreSQL

  FO->>API: GET /exam-rounds (open)
  API->>DB: exam_rounds
  API-->>FO: rounds + fee_level_i ii MMK

  FO->>API: GET /exam-rounds/{id}/venues
  API->>DB: exam_round_venues join exam_venues
  API-->>FO: venues capacity

  Note over FO: STEP1-3 profile photo from GET /me

  FO->>API: POST /files (optional presign) JPG
  API->>DB: file_attachments
  API-->>FO: photo_file_id

  FO->>API: POST /application-submissions
  Note right of FO: exam_levels I II same exam_venue_id

  API->>DB: BEGIN
  API->>DB: INSERT application_submissions
  API->>DB: INSERT applications row I
  API->>DB: INSERT applications row II
  Note right of DB: status submitted photo pending payment unpaid
  API->>DB: COMMIT

  API-->>FO: 201 submission + application ids
  Note over FO,API: No email_outbox on submit 0527

  FO->>API: GET /applications
  API-->>FO: display_status pending photo review
```

| API | Method | Path |
| --- | --- | --- |
| 회차·응시료 | GET | `/exam-rounds`, `/exam-rounds/{id}` |
| 시험장 | GET | `/exam-rounds/{id}/venues` |
| 프로필·사진 | GET | `/me` |
| 파일 | POST | `/files`, `/files/presign` |
| **제출** | POST | `/application-submissions` |
| 목록 | GET | `/applications` |

---

### B.2 BO 수납·사진심사 (오프라인 MMK)

**언제 보나**: BO 접수자 그리드 처리, `applications.rev` 낙관적 잠금(409), 상태 전이 QA.

**정책**: 수납은 **오프라인 현장** 기록(`payment_memo`, `receipt_no`). Ⅰ·Ⅱ 동시 접수 시 **급수별 개별 수납**. 사진 반려 시 `photo_rejected` 메일만(접수 완료 메일 없음).

```mermaid
sequenceDiagram
  autonumber
  participant BO as BO Admin
  participant API as API admin
  participant DB as PostgreSQL
  participant Mail as email_outbox

  BO->>API: GET /admin/applications?exam_round_id=
  API->>DB: applications join users
  API-->>BO: grid + rev

  BO->>API: POST /admin/applications/{id}/photo-review
  Note right of BO: If-Match rev action approve

  API->>DB: UPDATE applications rev plus 1
  Note right of DB: photo_review approved status payment_pending

  alt photo reject
    API->>DB: photo_review rejected status submitted
    API->>Mail: INSERT template_key photo_rejected
    API-->>BO: 200 + queued mail
  end

  BO->>API: POST /admin/applications/{id}/payment
  Note right of BO: offline MMK per level I or II

  API->>DB: payment_status paid paid_at status approved
  API->>DB: INSERT admin_audit_logs payment_complete
  API-->>BO: 200 updated rev

  opt concurrent admin conflict
    API-->>BO: 409 CONFLICT current rev
  end

  Note over BO,Mail: application_approved email on approve policy 0526
```

| API | Method | Path |
| --- | --- | --- |
| 목록 | GET | `/admin/applications` |
| 사진 심사 | POST | `/admin/applications/{id}/photo-review` |
| **오프라인 수납** | POST | `/admin/applications/{id}/payment` |
| 승인 | POST | `/admin/applications/{id}/approve` |
| 반려 | POST | `/admin/applications/{id}/reject` |
| 감사 | GET | `/admin/audit-logs` |

이메일: `photo_rejected`, `application_approved` → `REST_API_명세_초안.md` §4.

---

### B.3 BO 수험번호 일괄 부여 (13자리·알파벳 순)

**언제 보내**: 수납 마감 후 일괄 채번, `exam_number_sequences` + `FOR UPDATE`, 동시 접수 venue code 검증.

**정책**: `name_en` ASC, ⑤ serial 0001~; Ⅰ+Ⅱ **동일 ④ venue_code**; **수험번호 발급 이메일 없음**(0527); FO 노출은 `exam_rounds.exam_number_visible_at` 이후.

```mermaid
sequenceDiagram
  autonumber
  participant BO as BO Admin
  participant API as API admin
  participant DB as PostgreSQL

  BO->>API: POST /admin/exam-rounds/{id}/exam-numbers/assign
  Note right of BO: mode preview filters paid photo approved

  API->>DB: SELECT applications ORDER BY name_en
  API-->>BO: preview list gaps reasons

  BO->>API: POST assign mode confirm

  API->>DB: BEGIN
  loop each venue and level I II
    API->>DB: SELECT exam_number_sequences FOR UPDATE
    loop each applicant name_en ASC
      Note right of DB: 025 001 7or8 venue_code serial
      API->>DB: UPDATE applications exam_number
      API->>DB: INCREMENT last_serial
    end
  end
  API->>DB: INSERT admin_audit_logs assign_exam_numbers
  API->>DB: COMMIT
  API-->>BO: assigned count skipped

  Note over BO,API: No email_outbox on assign 0527

  FO->>API: GET /applications
  Note right of API: exam_number null until visible_at
  API-->>FO: exam_number when visible
```

| API | Method | Path |
| --- | --- | --- |
| 미리보기·확정 | POST | `/admin/exam-rounds/{id}/exam-numbers/assign` |
| FO 조회 | GET | `/applications`, `/applications/{id}` |
| 회차 노출일 | PATCH | `/admin/exam-rounds/{id}` (`exam_number_visible_at`) |

채번 형식: `025` + `001` + `7|8` + `venue_code`(2) + `serial`(4) — `DB스키마_초안.md` §4.8.

---

### B.4 이메일 발송 (이벤트 → outbox → 워커)

**언제 보나**: SMTP 워커·템플릿 연동, 트리거 매트릭스 점검. **미발송**: 접수 완료·수험번호 부여.

```mermaid
sequenceDiagram
  autonumber
  participant Svc as Domain Service
  participant DB as PostgreSQL
  participant W as Mail Worker
  participant SMTP as SMTP SES

  Svc->>DB: state change e.g. photo-review reject
  Svc->>DB: INSERT email_outbox queued
  Note right of DB: template_key locale body_html related_id

  W->>DB: SELECT status queued LIMIT n
  W->>W: render from 시안/email templates
  W->>SMTP: SEND
  alt success
    W->>DB: UPDATE status sent sent_at
  else failure
    W->>DB: retry_count plus 1 status failed
  end

  Note over Svc,SMTP: NOT enqueued signup complete or exam_number assign
```

| template_key | 트리거 (예) | API·도메인 |
| --- | --- | --- |
| `signup_verify_code` | 가입 인증 | `POST /auth/email/verify/send` |
| `password_reset` | 비밀번호 찾기 | `POST /auth/password/forgot` |
| `photo_rejected` | 사진 반려 | `POST .../photo-review` reject |
| `application_approved` | 승인 완료 | `POST .../approve` |
| `application_rejected` | 접수 반려 | `POST .../reject` |
| `board_refund_received` | 환불·정정 작성 | `POST /board/posts` |
| `board_admin_new_post` | 운영자 알림 | 동일 |
| `board_reply` | 답변·댓글 | `POST .../reply` |
| `inquiry_answered` | 문의 답변 | workflow answered |
| `notice_marketing` | 공지 publish | `PATCH /admin/notices` |
| `temp_password` | BO 임시 비밀번호 | `POST /admin/users/{id}/reset-password` |
| `account_status` | 정지·탈퇴 | `PATCH /admin/users/{id}` |
| `member_info_changed` | 회원정보 수정 | 동일 |
| `password_expiry_reminder` | 6개월 권고 | 배치 |

전체 14종: `시안/email/README.md`. 스키마: `DB스키마_초안.md` §4.17.

---

## C) 프로토타입 ↔ API 흐름 (C안)

| 프로토타입 키 | 본 문서 플로우 |
| --- | --- |
| `topik_mm_reglist_v1` | B.1 |
| `topik_mm_record_locks_v1` | B.2 (`rev` / 409) |
| BO 수험번호 모달 | B.3 |
| `topik_mm_mail_outbox_v1` | B.4 |

---

## D) 관련 문서

| 문서 | 경로 |
| --- | --- |
| DB 스키마 상세 | `DB스키마_초안.md` |
| DDL | `../../db/migrations/V001__initial_schema.sql` |
| REST API | `REST_API_명세_초안.md` |
| 마이그레이션·시드 | `마이그레이션_및_시드.md` |
| FO 접수 | `FO/04_TOPIK접수_기능정의서.md` |

---

## E) 변경 이력

| 버전 | 일자 | 내용 |
| --- | --- | --- |
| v0.1 | 2026-06-03 | ERD 전체 + 시퀀스 4종 — 백로그 #9 |
