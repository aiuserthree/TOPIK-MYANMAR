# TOPIK Myanmar — DB 스키마 초안 (v0.1)

> **목적**: A/B/C UI 시안과 무관한 **프로덕션 데이터 모델** 초안.  
> **근거**: `기능정의서/FO/*`, `기능정의서/BO/*`, `개발자_체크리스트.md` 143–169, 프로토타입 `html/A안` + `html/shared` localStorage 키.  
> **DB 엔진**: PostgreSQL 15+ (**확정** — `백엔드_스택_결정.md`). 마이그레이션: Flyway SQL. 런타임 ORM: Drizzle(Node). 본 문서는 논리 스키마만 정의.

---

## 1. 설계 원칙

| 항목 | 결정 |
| --- | --- |
| 동시 접수(Ⅰ+Ⅱ) | **`application_submissions`(1건) + `applications`(급수별 1~2행)**. 동일 `submission_id`, 동일 `venue_id` 강제(BO 수험번호 채번). |
| 수험번호 | **급수(`applications`) 단위** 13자리 `CHAR(13)`. 동시 접수 시 ④ 시험장 코드 동일, ③ 수준코드만 7/8 상이. |
| FO 노출 상태 | `applications.status` 7종 + `photo_review_status` + `payment_status` 분리(집계는 API에서 배지 매핑). |
| 낙관적 잠금 | `applications.rev`, `users.rev`, `admin_users.rev` — BO 동시 수납/승인 시 409. |
| 개인정보 | 비밀번호 `password_hash`만 DB. **여권번호(`passport_no`) FO 미수집** — 컬럼은 V001 레거시·nullable 미사용. 생년월일 등 암호화는 운영 합의 (`[-]`). |

---

## 2. ER 개요 (Mermaid)

> **상세 ERD·시퀀스 플로우**: [`ERD_및_플로우.md`](ERD_및_플로우.md) — V001 전 엔티티, Ⅰ+Ⅱ 동시 접수, FO/BO/이메일 시퀀스 4종.

```mermaid
erDiagram
  users ||--o{ applications : submits
  users ||--o{ term_agreements : agrees
  users ||--o{ board_posts : writes
  exam_rounds ||--o{ applications : has
  exam_venues ||--o{ applications : assigned
  application_submissions ||--|{ applications : contains
  applications ||--o|{ file_attachments : photo
  admin_users ||--o{ admin_audit_logs : performs
  terms ||--o{ term_agreements : version
  board_posts ||--o{ board_comments : has
  board_posts ||--o{ file_attachments : attaches
  email_outbox }o--|| users : to_user
```

---

## 3. 공통 열거형

### 3.1 `applications.status` (FO 배지 7종)

| DB 값 | FO 표시 | 비고 |
| --- | --- | --- |
| `submitted` | 접수완료 | 제출 직후, 사진 미심사 |
| `photo_review` | 사진심사중 | `photo_review_status` 연동 |
| `payment_pending` | 수납대기 | 사진 승인 후, `payment_status=unpaid` |
| `approved` | 승인완료 | 수납 완료 |
| `exam_number_assigned` | 수험번호부여 | `exam_number` NOT NULL |
| `rejected` | 반려 | |
| `cancelled` | 취소됨 | FO 취소 또는 탈퇴 연쇄 |

**BO 전용 분류(표시/필터)**: `payment_status=refunded` → 그리드 **환불자**, `exam_number` **유지**(0526).

### 3.2 `photo_review_status`

`pending` | `approved` | `rejected` (+ `reject_reason_code`, `reject_note`)

반려 코드(사진): `not_frontal`, `hat_glasses`, `bw_photo`, `blurry`, `not_self`, `other` (기능정의서 BO 2_1_3)

### 3.3 `payment_status`

`unpaid` | `paid` | `refunded`

### 3.4 `exam_level`

`I` | `II` — DB는 로마 숫자. 수준코드: Ⅰ→`7`, Ⅱ→`8`.

### 3.5 `exam_rounds.registration_status`

`scheduled` | `open` | `closed` — FO STEP1 접수중/예정/마감.

### 3.6 `users.status` / `admin_users.role`

회원: `active` | `suspended` | `withdrawn`  
관리자: `super` | `standard` | `readonly`

### 3.7 `board_posts.board_type`

`refund_correction` | `inquiry` | (공지는 `notices` 분리)

### 3.8 `board_posts.workflow_status`

환불·정정: `received` | `in_review` | `completed` | `rejected`  
문의: `awaiting_reply` | `answered`

---

## 4. 테이블 정의

### 4.1 `users` (체크 143)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | PK | |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | 로그인 ID |
| `password_hash` | `VARCHAR(255)` | NULL | 구글 가입 시 NULL |
| `signup_provider` | `VARCHAR(16)` | NOT NULL, DEFAULT `email` | `email` \| `google` |
| `provider_uid` | `VARCHAR(128)` | NULL | Google `sub` |
| `name_ko` | `VARCHAR(50)` | NOT NULL | |
| `name_en` | `VARCHAR(80)` | NOT NULL | 수험번호 정렬 기준 |
| `birth_date` | `CHAR(8)` | NOT NULL | YYYYMMDD |
| `gender` | `CHAR(1)` | NOT NULL | `1`/`2` (연명부) |
| `nationality` | `VARCHAR(50)` | NOT NULL | |
| `first_language` | `VARCHAR(50)` | NOT NULL | |
| `phone` | `VARCHAR(32)` | NOT NULL | |
| `passport_no` | `VARCHAR(32)` | NULL | **미사용(미수집 확정)** — V001 레거시. 신규 INSERT/API 미포함 |
| `job_code` | `SMALLINT` | NOT NULL | 1–12 (`html/shared/roster-codes.js`) |
| `motive_code` | `SMALLINT` | NOT NULL | 1–11 |
| `purpose_code` | `SMALLINT` | NOT NULL | 1–15 |
| `photo_file_id` | `BIGINT` | FK → `file_attachments` | 증명사진 |
| `preferred_lang` | `CHAR(2)` | NOT NULL, DEFAULT `ko` | `ko`/`my`/`en` |
| `marketing_opt_in` | `BOOLEAN` | NOT NULL, DEFAULT false | 공지 메일 (0527) |
| `password_changed_at` | `TIMESTAMPTZ` | NULL | 6개월 유도 |
| `status` | `VARCHAR(16)` | NOT NULL | §3.6 |
| `rev` | `INTEGER` | NOT NULL, DEFAULT 1 | 낙관적 잠금 |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | |
| `withdrawn_at` | `TIMESTAMPTZ` | NULL | |

**인덱스**: `UNIQUE(email)`, `INDEX(status, created_at)`, `INDEX(name_en)` (수험번호 부여 정렬)

---

### 4.2 `exam_rounds` (체크 144)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | PK | |
| `round_no` | `SMALLINT` | UNIQUE, NOT NULL | 예: 98 → "제98회" |
| `title` | `VARCHAR(100)` | NOT NULL | 표시용 회차명 |
| `exam_date` | `DATE` | NOT NULL | |
| `registration_start_at` | `TIMESTAMPTZ` | NOT NULL | |
| `registration_end_at` | `TIMESTAMPTZ` | NOT NULL | |
| `result_announcement_date` | `DATE` | NULL | 합격발표 |
| `fee_level_i` | `DECIMAL(12,2)` | NULL | MMK 등 |
| `fee_level_ii` | `DECIMAL(12,2)` | NULL | |
| `capacity` | `INTEGER` | NULL | 회차 정원 |
| `registration_status` | `VARCHAR(16)` | NOT NULL | §3.5 |
| `exam_number_visible_at` | `TIMESTAMPTZ` | NULL | FO 수험번호 노출일 (0527) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | |
| `rev` | `INTEGER` | NOT NULL, DEFAULT 1 | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL | |

**인덱스**: `UNIQUE(round_no)`, `INDEX(registration_status, registration_end_at)`

---

### 4.3 `country_region_codes` (마스터)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `country_code` | `CHAR(3)` | PK 일부, 예: `025` 미얀마 |
| `region_code` | `CHAR(3)` | PK 일부, 예: `001` 양곤 |
| `name_ko` / `name_en` | `VARCHAR` | |

---

### 4.4 `exam_venues` (체크 145)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | PK | |
| `venue_code` | `CHAR(2)` | UNIQUE, NOT NULL | 01–99, 수험번호 ④ |
| `name_ko` | `VARCHAR(100)` | NOT NULL | |
| `name_en` | `VARCHAR(120)` | NULL | |
| `address` | `TEXT` | NULL | |
| `country_code` | `CHAR(3)` | NOT NULL, DEFAULT `025` | |
| `region_code` | `CHAR(3)` | NOT NULL | |
| `capacity` | `INTEGER` | NOT NULL | |
| `note` | `TEXT` | NULL | 책임자 등 수기 |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | |
| `rev` | `INTEGER` | NOT NULL, DEFAULT 1 | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL | |

**인덱스**: `UNIQUE(venue_code)`, `INDEX(country_code, region_code, is_active)`

---

### 4.5 `exam_round_venues` (회차–시험장 N:M)

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `exam_round_id` | `BIGINT` | PK, FK |
| `exam_venue_id` | `BIGINT` | PK, FK |

---

### 4.6 `application_submissions` (동시 접수 그룹)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `user_id` | `BIGINT` | FK → users |
| `exam_round_id` | `BIGINT` | FK |
| `submitted_at` | `TIMESTAMPTZ` | FO 접수 완료 시각 |
| `terms_snapshot` | `JSONB` | 제출 시 약관 버전 ID 목록 |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

**인덱스**: `UNIQUE(user_id, exam_round_id)` — 동일 회차 1그룹(Ⅰ+Ⅱ 포함)

---

### 4.7 `applications` (체크 146)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | PK | |
| `submission_id` | `BIGINT` | FK, NOT NULL | |
| `user_id` | `BIGINT` | FK, NOT NULL | 비정규화(조회) |
| `exam_round_id` | `BIGINT` | FK, NOT NULL | |
| `exam_level` | `VARCHAR(2)` | NOT NULL | `I` \| `II` |
| `exam_venue_id` | `BIGINT` | FK, NOT NULL | 동시 접수 시 동일 venue |
| `application_no` | `VARCHAR(24)` | UNIQUE | FO 접수번호(표시) |
| `exam_number` | `CHAR(13)` | UNIQUE, NULL | 부여 후 설정 |
| `status` | `VARCHAR(24)` | NOT NULL | §3.1 |
| `photo_review_status` | `VARCHAR(16)` | NOT NULL | §3.2 |
| `photo_reject_code` | `VARCHAR(32)` | NULL | |
| `photo_reject_note` | `TEXT` | NULL | |
| `payment_status` | `VARCHAR(16)` | NOT NULL | §3.3 |
| `paid_at` | `TIMESTAMPTZ` | NULL | |
| `payment_memo` | `TEXT` | NULL | 수납 메모 |
| `receipt_no` | `VARCHAR(64)` | NULL | 영수증 번호 |
| `reject_code` | `VARCHAR(32)` | NULL | 접수 반려: `photo_invalid`, `info_mismatch`, `duplicate`, `other` |
| `reject_note` | `TEXT` | NULL | |
| `cancelled_at` | `TIMESTAMPTZ` | NULL | |
| `cancel_reason` | `TEXT` | NULL | |
| `profile_snapshot` | `JSONB` | NOT NULL | 제출 시점 성명·코드 등 스냅샷 |
| `photo_file_id` | `BIGINT` | FK | 접수 시점 사진 |
| `rev` | `INTEGER` | NOT NULL, DEFAULT 1 | §162 |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL | |

**제약**

- `UNIQUE(user_id, exam_round_id, exam_level)` WHERE `status <> 'cancelled'` (부분 유니크, PG)
- 동시 접수: 애플리케이션 레이어에서 동일 `submission_id` + 동일 `exam_venue_id` 검증

**인덱스 (체크 155–156)**

- `INDEX(exam_round_id, status)` — BO 목록
- `INDEX(exam_round_id, exam_venue_id, status)`
- `INDEX(exam_number)` WHERE `exam_number IS NOT NULL`
- `INDEX(user_id, exam_round_id)`

---

### 4.8 수험번호 13자리 규칙 (체크 146, BO 2_1_8)

```
① country_code   CHAR(3)  — users/exam_venues → 025
② region_code    CHAR(3)  — 001
③ level_code     CHAR(1)  — 7=Ⅰ, 8=Ⅱ
④ venue_code     CHAR(2)  — exam_venues.venue_code
⑤ serial         CHAR(4)  — 회차×시험장×수준별 0001~, name_en ASC
```

- 채번 트랜잭션: `exam_number_sequences(exam_round_id, exam_venue_id, exam_level, last_serial)` + `SELECT … FOR UPDATE` (체크 163)
- 장애인 편의: 마지막 홀수 우선 — `serial` 배정 알고리즘에 플래그 `accommodation_requested` (추가 컬럼, 운영 합의)

---

### 4.9 `admin_users` (체크 148)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `name` | `VARCHAR(50)` | NOT NULL |
| `email` | `VARCHAR(255)` | UNIQUE |
| `password_hash` | `VARCHAR(255)` | NOT NULL |
| `role` | `VARCHAR(16)` | §3.6 |
| `is_active` | `BOOLEAN` | |
| `last_login_at` | `TIMESTAMPTZ` | |
| `rev` | `INTEGER` | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

---

### 4.10 `admin_audit_logs` (체크 147)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `admin_user_id` | `BIGINT` | FK |
| `target_table` | `VARCHAR(64)` | NOT NULL |
| `target_id` | `BIGINT` | NOT NULL |
| `action` | `VARCHAR(32)` | `payment_complete`, `approve`, `reject`, `assign_exam_numbers`, … |
| `status_before` | `VARCHAR(32)` | NULL |
| `status_after` | `VARCHAR(32)` | NULL |
| `memo` | `TEXT` | NULL |
| `payload` | `JSONB` | diff·부여 건수 등 |
| `created_at` | `TIMESTAMPTZ` | NOT NULL |

**인덱스 (체크 157)**: `INDEX(target_table, target_id)`, `INDEX(created_at DESC)`

---

### 4.11 `notices` (체크 149)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `category` | `VARCHAR(16)` | `important`/`registration`/`exam`/`result` |
| `title` | `VARCHAR(200)` | |
| `body_html` | `TEXT` | sanitize 저장 |
| `is_published` | `BOOLEAN` | FO 노출 ON/OFF |
| `is_pinned` | `BOOLEAN` | 상단 고정 |
| `view_count` | `INTEGER` | |
| `author_admin_id` | `BIGINT` | FK |
| `published_at` | `TIMESTAMPTZ` | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

---

### 4.12 `board_posts` (체크 150)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `board_type` | `VARCHAR(24)` | §3.7 |
| `user_id` | `BIGINT` | FK |
| `category` | `VARCHAR(16)` | 문의: reg/exam/etc |
| `post_type` | `VARCHAR(16)` | refund: `refund`/`correction` |
| `title` | `VARCHAR(100)` | |
| `body` | `TEXT` | |
| `is_secret` | `BOOLEAN` | |
| `secret_password_hash` | `VARCHAR(255)` | NULL |
| `workflow_status` | `VARCHAR(16)` | §3.8 |
| `admin_reply` | `TEXT` | NULL |
| `admin_replied_at` | `TIMESTAMPTZ` | |
| `admin_replier_id` | `BIGINT` | FK |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

---

### 4.13 `board_comments` (체크 151)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `board_post_id` | `BIGINT` | FK |
| `parent_comment_id` | `BIGINT` | FK, NULL = 댓글 |
| `author_user_id` | `BIGINT` | NULL |
| `author_admin_id` | `BIGINT` | NULL |
| `body` | `TEXT` | |
| `is_secret` | `BOOLEAN` | 비밀글 연동 |
| `is_deleted` | `BOOLEAN` | soft delete |
| `created_at` | `TIMESTAMPTZ` | |

---

### 4.14 `faq_items` (체크 152)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `category` | `VARCHAR(16)` | |
| `sort_order` | `INTEGER` | |
| `question_ko` / `question_my` / `question_en` | `TEXT` | |
| `answer_ko` / `answer_my` / `answer_en` | `TEXT` | |
| `is_active` | `BOOLEAN` | |
| `updated_at` | `TIMESTAMPTZ` | |

---

### 4.15 `terms` / `term_agreements` (체크 153–154)

**`terms`**

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `term_type` | `VARCHAR(24)` | `service`/`privacy`/`marketing` |
| `version` | `VARCHAR(16)` | v1.0 |
| `body_ko` / `body_my` / `body_en` | `TEXT` | |
| `effective_at` | `TIMESTAMPTZ` | |
| `status` | `VARCHAR(16)` | `draft`/`published`/`retired` |

**`term_agreements`**

| 컬럼 | 타입 |
| --- | --- |
| `id` | `BIGSERIAL` |
| `user_id` | FK |
| `term_id` | FK |
| `agreed_at` | `TIMESTAMPTZ` |
| `ip_address` | `INET` |
| `user_agent` | `TEXT` |

**인덱스**: `UNIQUE(user_id, term_id)` 또는 이력 보존 시 복합 PK + `agreed_at`

---

### 4.16 `file_attachments` (체크 168–169)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `owner_type` | `VARCHAR(24)` | `user_photo`/`board`/`notice` |
| `owner_id` | `BIGINT` | |
| `storage_key` | `VARCHAR(512)` | S3 key 또는 상대 경로 |
| `original_filename` | `VARCHAR(255)` | |
| `mime_type` | `VARCHAR(64)` | `image/jpeg` 등 |
| `size_bytes` | `INTEGER` | |
| `checksum_sha256` | `CHAR(64)` | |
| `created_at` | `TIMESTAMPTZ` | |

- 증명사진 운영 파일명: **`{exam_number}.jpg`** (부여 후 rename 또는 별도 `exam_photo_key`)
- 접근: **서명 URL 또는 인증 프록시** (공개 URL 금지)

---

### 4.17 `email_outbox` (체크 193 연계)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGSERIAL` | PK |
| `template_key` | `VARCHAR(64)` | 14종 transactional (`시안/email/README.md`) |
| `locale` | `CHAR(2)` | ko/my/en |
| `to_email` | `VARCHAR(255)` | |
| `user_id` | `BIGINT` | NULL |
| `subject` | `VARCHAR(255)` | |
| `body_html` | `TEXT` | |
| `status` | `VARCHAR(16)` | `queued`/`sent`/`failed` |
| `retry_count` | `SMALLINT` | |
| `related_table` | `VARCHAR(64)` | |
| `related_id` | `BIGINT` | |
| `sent_at` | `TIMESTAMPTZ` | |
| `created_at` | `TIMESTAMPTZ` | |

---

### 4.18 보조 테이블 (API·보안)

| 테이블 | 용도 |
| --- | --- |
| `email_verification_codes` | 회원가입 6자리, 5분 TTL |
| `password_reset_tokens` | 재설정 인증코드 및 검증 후 토큰, 30분 TTL |
| `user_sessions` | httpOnly 세션 또는 refresh token |
| `notice_view_logs` | 공지 조회수 1회/세션 (FO 63) |
| `exam_number_sequences` | 채번 원자성 (§4.8) |

---

## 5. 프로토타입 localStorage ↔ 서버 매핑

| localStorage / session 키 | 프로토타입 용도 | 프로덕션 대응 |
| --- | --- | --- |
| `tm_session` | FO 로그인 플래그 | `user_sessions` / JWT |
| `tm_topik_profile_v1` / `TMProfile` | 회원 프로필 | `users` + `file_attachments` |
| `topik_mm_reglist_v1` | 접수 목록 JSON 배열 | `application_submissions` + `applications` |
| `topik_mm_boards_v1` | 환불·문의 글 | `board_posts` + `board_comments` |
| `topik_mm_content_v1` | 공지·FAQ | `notices` + `faq_items` |
| `topik_mm_venues_v1` | 시험장 마스터 | `exam_venues` |
| `topik_mm_admin_users_v1` | BO 계정 | `admin_users` |
| `topik_mm_audit_v3` | 처리 이력 | `admin_audit_logs` |
| `topik_mm_mail_outbox_v1` | 메일 시뮬 | `email_outbox` |
| `topik_mm_record_locks_v1` | 행 잠금 | `applications.rev` + 409 |
| `tm_admin_session_v1` | BO 세션 | admin 세션 테이블 |
| `tpkm_register_draft` (B안) | 접수 임시저장 | `application_drafts` (정책 합의 후) |

### 5.1 프로토타입 `topik_mm_reglist_v1` 필드 → `applications`

| JSON 필드 | DB |
| --- | --- |
| `id` | `applications.id` (또는 UUID `application_no`) |
| `round` / `roundName` | `exam_round_id` / 표시 |
| `levelKey` `I`/`II`/`BOTH` | BOTH → **2 rows** (`I`, `II`) |
| `status` pending/review/… | `status` + `photo_review_status` + `payment_status` |
| `paid` | `payment_status` |
| `examNo` | `exam_number` |
| `photo` (base64/data URL) | `file_attachments` + `photo_file_id` |
| `nameKo`, `birth`, … | `profile_snapshot` + `users` |

---

## 6. 미착수·운영 합의 (체크리스트 잔여)

| NO | 항목 | 본 문서 |
| ---: | --- | --- |
| 158 | Flyway/Liquibase 선택 | **Flyway** — `마이그레이션_및_시드.md`, `db/migrations/V001__initial_schema.sql` |
| 159 | 시드 데이터 SQL | `db/seed/dev_seed.sql` (dev only) |
| 160–161 | 백업·트랜잭션 정책 | `마이그레이션_및_시드.md` §5 초안 |
| 165–167 | 암호화·보존·DB 계정 분리 | `[-]` / 보안 검토 |
| 170 | ZIP 임시 파일 | BO 배치 설계 (별도) |

---

## 7. 변경 이력

| 버전 | 일자 | 내용 |
| --- | --- | --- |
| v0.1 | 2026-06-02 | 초안 작성 — 체크리스트 143–154, 155–157, 162–164, 168–169 반영 |
| v0.1 | 2026-06-03 | `ERD_및_플로우.md` 링크(§2) — 백로그 #9 |

**참고 문서**: `기능정의서/ERD_및_플로우.md`, `기능정의서/백엔드_스택_결정.md`, `기능정의서/FO/04_TOPIK접수_기능정의서.md`, `기능정의서/BO/02_접수관리_기능정의서.md`, `기능정의서/BO/03_시험관리_기능정의서.md`, `html/shared/topik-bo-core.js`, `build.py` (A안→public, shared 복사).
