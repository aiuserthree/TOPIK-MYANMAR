# TOPIK Myanmar API (Phase 0–1)

Node.js 20 + Fastify 4 + TypeScript skeleton. PostgreSQL schema lives in `../db/` (Flyway SQL).

**macOS 로컬 실행 (PostgreSQL 설치부터):** [로컬실행_가이드.md](./로컬실행_가이드.md)

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (로컬 또는 IwinV DB VPS 원격)
- `psql` CLI (for `npm run migrate`)

## Quick start

```bash
# 1. PostgreSQL 준비 (로컬실행_가이드.md 참고)

# 2. Install & migrate
cd api
cp .env.example .env
npm install
npm run migrate

# 3. Run API
npm run dev
```

Server: `http://localhost:3000`

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Process health |
| GET | `/health/db` | — | PostgreSQL ping |
| GET | `/api/v1/exam-rounds` | — | Exam rounds (`?registration_status=open`) |
| GET | `/api/v1/exam-venues` | — | Active exam venues |
| POST | `/api/v1/auth/login` | — | Email/password → JWT (FO user or admin) |
| GET | `/api/v1/auth/google/config` | — | `{enabled, client_id}` — FO decides whether to render the Google button |
| POST | `/api/v1/auth/google` | — | Verify Google ID token → upsert user → JWT (503 if not configured) |
| POST | `/api/v1/auth/send-verification-code` | — | 회원가입 이메일 인증코드 (dev: `dev_code` in response) |
| POST | `/api/v1/auth/verify-email` | — | 인증코드 확인 → `verification_token` |
| POST | `/api/v1/auth/register` | — | 회원가입 완료 → JWT (만 14세 미만 → `422` `AGE_RESTRICTED`) |
| GET | `/api/v1/application-draft` | Bearer | 접수 임시저장 조회 (없으면 `404`) |
| PUT | `/api/v1/application-draft` | Bearer | 접수 임시저장 upsert (`{ payload }`, TTL 30일) |
| DELETE | `/api/v1/application-draft` | Bearer | 접수 임시저장 삭제 (제출 완료 후 FO에서 호출) |
| GET | `/api/v1/me` | Bearer | FO profile (`user.password_changed_at` ISO — 마이페이지 비밀번호 변경일 표시) |
| POST | `/api/v1/application-submissions` | Bearer | 4단계 접수 제출 (submission + 1–2 applications) |
| GET | `/api/v1/applications` | Bearer | 마이페이지 접수 목록 (submission별 집계) |
| POST | `/api/v1/application-submissions/:id/cancel` | Bearer | 접수 취소 (수납 전) |
| GET | `/api/v1/notices` | — | 공지 목록 (`?category=`, `?home_preview=1`) |
| GET | `/api/v1/notices/:id` | — | 공지 상세 |
| GET | `/api/v1/faq` | — | FAQ (`?lang=ko`) |
| GET | `/api/v1/terms` | — | 게시 중 약관 종류별 최신본 목록 (본문 제외) |
| GET | `/api/v1/terms/:type` | — | 약관 본문 (`service`\|`privacy`\|`marketing`, `?lang=ko\|my\|en`) |
| GET | `/api/v1/board/posts` | Bearer | 내 게시글 목록 (`?board_type=inquiry`) |
| POST | `/api/v1/board/posts` | Bearer | 문의·환불 글 작성 |
| GET | `/api/v1/files/:id` | Bearer / `?token=` | 파일 스트림 (소유자 또는 관리자) |
| GET | `/api/v1/admin/files/:id` | Admin Bearer / `?token=` | 파일 스트림 (관리자 전용, BO 썸네일/사진심사) |
| GET | `/api/v1/admin/exam-rounds` | Admin Bearer (조회자 포함) | 회차 목록 + 통계 + 시험장 (BO 컨텍스트 셀렉터) |
| GET | `/api/v1/admin/applications` | Admin Bearer (조회자 포함) | 접수자 목록 (필터·검색·페이지네이션·정렬) |
| GET | `/api/v1/admin/applications/:id` | Admin Bearer (조회자 포함) | 접수 상세 + 사진 + 처리 이력 |
| POST | `/api/v1/admin/applications/:id/payment` | Admin Bearer | 오프라인 수납 완료 (paid → status `approved`) |
| POST | `/api/v1/admin/applications/:id/payment/cancel` | Admin Bearer | 수납 취소(환불) — `refunded`, 수험번호 유지 |
| POST | `/api/v1/admin/exam-rounds/:roundId/assign-exam-numbers` | Admin Bearer | 13자리 수험번호 일괄 부여 (`dry_run`, idempotent) |
| GET | `/api/v1/admin/exam-rounds/:roundId/roster.xlsx` | Admin Bearer | 연명부 양식 엑셀 (시험장×수준별 시트) |
| GET | `/api/v1/admin/exam-rounds/:roundId/photos.zip` | Admin Bearer | 사진 ZIP (`{지역}/{시험장}/TOPIK_Ⅰ\|Ⅱ/{수험번호}.jpg` + 누락_리포트.xlsx) |
| POST | `/api/v1/admin/applications/:id/approve` | Admin Bearer | 접수 승인 + `application_approved` 메일 |
| POST | `/api/v1/admin/applications/:id/reject` | Admin Bearer | 접수 반려 + `application_rejected` 메일 |
| POST | `/api/v1/admin/applications/:id/photo-review` | Admin Bearer | 사진 심사 (`action`: `approve` \| `reject`) |
| POST | `/api/v1/admin/applications/:id/reject-photo` | Admin Bearer | 사진 반려 (`photo-review` reject와 동일) |
| POST | `/api/v1/admin/board/posts/:id/reply` | Admin Bearer | 공식 답변 + `board_reply` 메일 |
| PATCH | `/api/v1/admin/users/:id` | Admin Bearer | 회원 수정 + `member_info_changed` 메일 |
| POST | `/api/v1/admin/users/:id/notify-changed` | Admin Bearer | 회원정보 변경 통지만 발송 |
| POST | `/api/v1/admin/users/:id/reset-password` | Admin Bearer | 임시 비밀번호 + `temp_password` 메일 |
| POST | `/api/v1/admin/admin-users/:id/reset-password` | Admin Bearer (super for others) | BO 임시 비밀번호 + `temp_password_admin` |
| POST | `/api/v1/admin/notices/:id/send-marketing` | Admin Bearer | 마케팅 동의 회원 공지 알림 |
| GET | `/api/v1/admin/notices` | Admin Bearer (조회자 포함) | 공지 목록 (미게시 포함, `?category=&q=&published=0\|1&page=`) |
| GET | `/api/v1/admin/notices/:id` | Admin Bearer (조회자 포함) | 공지 상세 (미게시 포함) |
| POST | `/api/v1/admin/notices` | Admin Bearer | 공지 생성 (`is_published` 즉시 게시 옵션) |
| PATCH | `/api/v1/admin/notices/:id` | Admin Bearer | 공지 수정 (category/title/body_html/is_pinned) |
| POST | `/api/v1/admin/notices/:id/publish` \| `/unpublish` | Admin Bearer | 게시/게시중지 |
| DELETE | `/api/v1/admin/notices/:id` | Admin Bearer | 공지 삭제 |
| GET | `/api/v1/admin/faq` | Admin Bearer (조회자 포함) | FAQ 목록 (비활성 포함, `?category=&active=`) |
| GET | `/api/v1/admin/faq/:id` | Admin Bearer (조회자 포함) | FAQ 상세 |
| POST | `/api/v1/admin/faq` | Admin Bearer | FAQ 생성 (ko 필수, my/en 선택) |
| PATCH | `/api/v1/admin/faq/:id` | Admin Bearer | FAQ 수정 (노출/숨김 포함) |
| POST | `/api/v1/admin/faq/reorder` | Admin Bearer | 정렬 순서 일괄 변경 (`{orders:[{id,sort_order}]}`) |
| DELETE | `/api/v1/admin/faq/:id` | Admin Bearer | FAQ 삭제 |
| GET | `/api/v1/admin/terms` | Admin Bearer (조회자 포함) | 약관 버전 목록 (`?type=&status=`) |
| GET | `/api/v1/admin/terms/:id` | Admin Bearer (조회자 포함) | 약관 상세 (본문 포함) |
| POST | `/api/v1/admin/terms` | Admin Bearer | 약관 새 버전 생성 (기본 draft) |
| PATCH | `/api/v1/admin/terms/:id` | Admin Bearer | 약관 수정 (draft 본문/시행일만) |
| POST | `/api/v1/admin/terms/:id/publish` | Admin Bearer | 게시 (같은 종류 기존 게시본 자동 retired) |
| DELETE | `/api/v1/admin/terms/:id` | Admin Bearer | 약관 삭제 (draft 만, 동의 이력 있으면 차단) |
| POST | `/api/v1/admin/exam-rounds` | Admin Bearer | 회차 생성 (`venue_ids` 시험장 매핑 포함) |
| GET | `/api/v1/admin/exam-rounds/:roundId` | Admin Bearer (조회자 포함) | 회차 상세 + 매핑 시험장 |
| PATCH | `/api/v1/admin/exam-rounds/:roundId` | Admin Bearer | 회차 수정 (기간·정원·응시료·`venue_ids`) |
| POST | `/api/v1/admin/exam-rounds/:roundId/status` | Admin Bearer | 접수 상태 전환 (`scheduled`\|`open`\|`closed`) |
| GET | `/api/v1/admin/exam-venues` | Admin Bearer (조회자 포함) | 시험장 목록 (비활성 포함, `?active=`) |
| GET | `/api/v1/admin/exam-venues/:id` | Admin Bearer (조회자 포함) | 시험장 상세 |
| POST | `/api/v1/admin/exam-venues` | Admin Bearer | 시험장 생성 (venue_code 2자리, 지역 FK) |
| PATCH | `/api/v1/admin/exam-venues/:id` | Admin Bearer | 시험장 수정 (접수 이력 있으면 코드 잠금) |
| POST | `/api/v1/admin/exam-venues/:id/activate` \| `/deactivate` | Admin Bearer | 사용 여부 토글 |
| GET | `/api/v1/admin/region-codes` | Admin Bearer (조회자 포함) | 국가/지역 코드 (시험장 등록용) |
| POST | `/internal/notifications/enqueue` | `X-Internal-Api-Key` | 단건 enqueue (수동 재발송) |
| POST | `/internal/notifications/enqueue-batch` | `X-Internal-Api-Key` | 최대 100건 일괄 enqueue |
| GET | `/internal/notifications/template-keys` | `X-Internal-Api-Key` | 허용 template_key 목록 |

### Submit example (Phase 1)

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@topik-mm.local","password":"DemoUser!2026"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:3000/api/v1/application-submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"exam_round_id":1,"exam_levels":["I"],"exam_venue_id":1,"photo_checklist_confirmed":true}'
```

Replace `exam_round_id` / `exam_venue_id` with IDs from `GET /api/v1/exam-rounds` and `GET /api/v1/exam-venues`.

### My applications (Phase 1)

```bash
curl -s http://localhost:3000/api/v1/applications \
  -H "Authorization: Bearer $TOKEN"
```

**Photo storage (real):** `photo_base64` (signup / profile / application) is decoded and
persisted via a pluggable driver (`lib/storage.ts`), and `file_attachments` records the real
`storage_key` / `mime_type` / `size_bytes` / `checksum_sha256` (no more `stub://`).
- `STORAGE_PROVIDER=local` (default) writes to `UPLOAD_DIR` (default `api/var/uploads`, gitignored)
  and serves bytes via `GET /api/v1/files/:id` (owner or admin only).
- `STORAGE_PROVIDER=s3` uploads via `@aws-sdk/client-s3`; GET `/files/:id` streams the object through the API (no S3 presigned redirect — avoids FO `fetch`/CORS failures).
  Requires `S3_BUCKET/S3_REGION/S3_ACCESS_KEY/S3_SECRET` (+ optional `S3_ENDPOINT/S3_PREFIX`); if any
  are missing it logs a warning and **falls back to local** (mirrors the mailer console fallback).
- `storage_key` is provider-tagged (`local:…` / `s3:…`). Legacy `stub://` rows resolve to 404.
- `<img>` can't send an Authorization header, so the file routes also accept `?token=<JWT>`.

**Policy 0527:** no email on registration complete.

### Signup age restriction (만 14세)

정책_합의_워크시트 §2.9 (임시 TBD): `MIN_SIGNUP_AGE_YEARS = 14`. 생년월일(`birth_date`, YYYYMMDD) 기준
**만 나이**로 검증하며, 미만이면 `POST /api/v1/auth/register` 가 `422` 와 함께 거부합니다.

```json
{
  "error": {
    "code": "AGE_RESTRICTED",
    "message": "만 14세 미만은 회원가입할 수 없습니다."
  }
}
```

FO `signup.html` 은 동일 규칙으로 2단계(기본정보)·가입 완료 전에 클라이언트 검증을 수행합니다.

### Application draft (접수 임시저장, V005)

로그인 사용자당 1건 (`application_drafts.user_id` UNIQUE). Flyway `V005__application_drafts.sql`.

| Method | Path | Body / response |
|--------|------|-----------------|
| GET | `/api/v1/application-draft` | `{ payload, updated_at, expires_at }` 또는 `404 NOT_FOUND` |
| PUT | `/api/v1/application-draft` | `{ "payload": { step, roundId, venueId, lvl1, lvl2, … } }` → `{ saved, payload, updated_at, expires_at }` |
| DELETE | `/api/v1/application-draft` | `{ deleted: true }` |

- TTL: 저장·갱신 시 `expires_at = NOW() + 30 days` (정책 NO.466 임시값).
- 만료·조회 전 `purgeExpiredDrafts` 로 기한 지난 행 삭제.
- FO `register.html`: API 연결 시 `TopikApi.get/save/deleteApplicationDraft`; 미연결 시 `localStorage` 키 `tpkm_register_draft_v1` 폴백.

```bash
curl -s http://localhost:3000/api/v1/application-draft \
  -H "Authorization: Bearer $TOKEN"

curl -s -X PUT http://localhost:3000/api/v1/application-draft \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"payload":{"step":2,"roundId":1,"venueId":1,"lvl1":true,"savedAt":"2026-06-05T00:00:00.000Z"}}'
```

### BO operational lifecycle (접수→수납→수험번호→연명부)

```
접수(submitted) → 사진심사(photo-review approve) → 수납대기(payment_pending)
  → 수납완료(POST .../payment → paid, status approved)
  → [수납 마감 후] 수험번호 일괄 부여(POST .../assign-exam-numbers → exam_number_assigned)
  → 연명부 엑셀 / 사진 ZIP 다운로드
환불: POST .../payment/cancel → payment_status=refunded (수험번호 유지)
```

**13자리 수험번호 규칙** (출처: `docs/기능정의서/BO/02_접수관리_기능정의서.md` §3 부여 원칙):
`① 국가코드(3) + ② 지역코드(3) + ③ 수준코드(1) + ④ 시험장코드(2) + ⑤ 응시자코드(4)`.
미얀마=`025`, 양곤=`001`, 수준 TOPIK Ⅰ→`7`/Ⅱ→`8`, 시험장코드=`exam_venues.venue_code`,
응시자코드=회차×시험장×수준 단위 `0001`부터 **영문성명 알파벳 오름차순** 순차 채번.
예) 양곤대(01) TOPIK Ⅰ 1번 → `0250017010001`. 동시접수(Ⅰ+Ⅱ)는 동일 시험장코드 유지(접수 시 확정).
부여는 멱등(이미 부여된 건 건너뜀), 회차 행 잠금으로 동시 실행 방지. `dry_run:true`로 미리보기.
0527 정책상 부여 즉시 노출하지 않음 — 노출 시점은 `exam_rounds.exam_number_visible_at`(옵션 `visible_at`로 설정).

```bash
# 수납 → 수험번호 부여 → 연명부/사진 다운로드 (admin token = $ADMIN_TOKEN)
curl -s -X POST "http://localhost:3000/api/v1/admin/applications/7/payment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"receipt_no":"RC-001","payment_memo":"offline 수납"}'

curl -s -X POST "http://localhost:3000/api/v1/admin/exam-rounds/5/assign-exam-numbers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"dry_run":true}'
curl -s -X POST "http://localhost:3000/api/v1/admin/exam-rounds/5/assign-exam-numbers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{}'

curl -s -o roster.xlsx "http://localhost:3000/api/v1/admin/exam-rounds/5/roster.xlsx" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -o photos.zip  "http://localhost:3000/api/v1/admin/exam-rounds/5/photos.zip" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Audit: `payment_complete` / `payment_cancel` / `exam_number_assign` / `photo_review_*` rows are
written to `admin_audit_logs`. Capacity guard: `POST .../payment` refuses when the venue is at
`exam_venues.capacity` (override with `{"ignore_capacity":true}`).

**Static BO UI (NO React):** `html/C안/BO/` wires these endpoints via
`html/shared/bo-api-client.js` + `assets/bo-common.js`:
- `login.html` · `applications.html` (접수→수납→수험번호→연명부)
- `rounds.html` (회차 생성/수정/접수개시·마감 + 시험장 매핑) · `venues.html` (시험장 CRUD)
- `notices.html` (공지 작성/수정/발행/삭제) · `faq.html` (FAQ CRUD + 정렬) · `terms.html` (약관 버전/게시)

All BO screens share a top nav (`.bo-nav`). The Claude-handoff `html/C안/BO(admin)/` is React/JSX
and is intentionally **not** extended. Serve BO from an allowed origin (e.g. `http://localhost:8080`).

### BO content management (공지/FAQ/약관/회차/시험장)

운영자가 DB 접근 없이 브라우저(BO)에서 콘텐츠·회차·시험장을 직접 관리합니다. 모든 변경은
`requireAdmin`(readonly 403) + `admin_audit_logs`에 기록되고, 조회(GET)는 `requireAnyAdmin`(조회자 포함).

- **공지:** FO `GET /api/v1/notices`는 게시본만 노출 — BO 목록(`/admin/notices`)은 미게시 포함.
- **FAQ:** `question/answer` ko 필수, my/en 선택(스키마 다국어 컬럼). `reorder`로 FO 노출 순서 변경.
- **약관/개인정보:** **DB 관리(기존 `terms` 테이블 사용)** — 회원가입·접수 동의가 이 테이블을 참조하므로
  버전·게시 상태를 코드로 관리. 게시 시 같은 종류 기존 게시본은 자동 `retired`. 본문 수정은 draft만
  허용(동의 무결성). FO는 `GET /api/v1/terms/:type`로 본문을 읽을 수 있음(정적 `terms.html`/`privacy.html`도
  유지 가능). **법무 최종 문안은 고객사 과제** — 여기서는 관리·버전 기능만 제공.
- **회차:** `POST /admin/exam-rounds`로 신규 회차 개설(접수기간·응시료·정원·시험장 매핑), `…/status`로
  접수개시/마감. 접수 이력이 있는 시험장은 매핑 해제 시 건너뜀(`venue_skipped` 반환).
- **시험장:** `venue_code`(2자리)는 13자리 수험번호의 ④ 시험장코드 — 접수 이력 발생 후 코드 변경 차단.
  국가/지역 코드는 `country_region_codes` FK(미설정 지역은 `INVALID_REGION` 400).

```bash
# 회차 생성 → 개시 → 시험장/공지/FAQ (admin token = $ADMIN_TOKEN)
curl -s -X POST "$API/api/v1/admin/exam-venues" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"venue_code":"06","name_ko":"양곤 신규고사장","country_code":"025","region_code":"001","capacity":300}'

curl -s -X POST "$API/api/v1/admin/exam-rounds" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"round_no":108,"title":"제108회 TOPIK","exam_date":"2026-12-20","registration_start_at":"2026-11-01T00:00:00+06:30","registration_end_at":"2026-11-10T23:59:59+06:30","fee_level_i":50000,"fee_level_ii":75000,"capacity":1200,"venue_ids":[1,2]}'

curl -s -X POST "$API/api/v1/admin/exam-rounds/5/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"registration_status":"open"}'

curl -s -X POST "$API/api/v1/admin/notices" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"category":"registration","title":"제108회 접수 안내","body_html":"<p>…</p>","is_published":true}'
```

> **마이그레이션 메모:** 위 기능은 새 테이블이 필요 없습니다 — `notices`/`faq_items`/`terms`/
> `exam_rounds`/`exam_venues`/`country_region_codes`는 모두 `db/migrations/V001`에 이미 존재합니다.
> 따라서 신규 스키마 마이그레이션 없음. (이후 스키마 변경 시 `db/migrations/V0xx`를 추가하고
> `scripts/migrate.js`에 연결하세요.)

### 관리자 계정 프로비저닝 (운영 안전)

운영 첫 관리자는 시드(약한 비밀번호)가 아니라 **`create-admin` 스크립트**로 만듭니다.

```bash
# 대화형 (비밀번호가 셸 히스토리에 남지 않음 — 권장)
npm run create-admin -- --email ops@embassy.go.kr --name "운영자"
# → 비밀번호 입력 / 확인 (8자+, 영문·숫자·특수문자) → bcrypt(cost 10) 저장, role super

# 비대화형 (CI/스크립트) — 비밀번호를 env로 전달
ADMIN_EMAIL=ops@embassy.go.kr ADMIN_NAME="운영자" ADMIN_PASSWORD='********' ADMIN_ROLE=super \
  npm run create-admin
```

- 이메일로 재실행하면 비밀번호/이름/role을 갱신하고 계정을 재활성화합니다(upsert).
- 약한 비밀번호·잘못된 role·잘못된 이메일은 거부합니다. **하드코딩 비밀번호 없음.**
- `DATABASE_URL`(api/.env 또는 환경변수) 필요.

### 운영 시드 (참조 데이터 전용)

`db/seed/prod_seed.sql`은 **비밀이 아닌 참조 데이터(국가/지역 코드)만** 넣습니다 — 데모 회원/관리자 없음.
13자리 수험번호 채번에 필요한 지역 코드를 시험장 생성 전에 보장하기 위함입니다. (직업/응시동기/응시목적
코드는 DB가 아니라 앱 상수 — `lib/admin-helpers.ts`, `html/shared/roster-codes.js`.)

```bash
npm run migrate:prod    # 스키마(필요 시) + 운영 시드(참조 데이터)
npm run seed:prod       # 운영 시드만 (idempotent)
```

## Transactional email templates

Production HTML uses **C안 에디토리얼** templates ported from `시안/email/templates/` into
`src/lib/email-templates/` (`templates-data.json` + `render-html.ts`).

| template_key | Trigger (route / event) | Status |
|--------------|------------------------|--------|
| `signup_verify_code` | `POST /api/v1/auth/send-verification-code` | wired |
| `password_reset` | `POST /api/v1/auth/forgot-password` | wired (6-digit code + optional FO link) |
| `board_refund_received` | `POST /api/v1/board/posts` (`board_type=refund_correction`) | wired |
| `board_admin_new_post` | `POST /api/v1/board/posts` (when `MAIL_ADMIN_TO` set) | wired |
| `account_status` | `POST /api/v1/me/withdraw` (`accountAction=withdrawn`) | wired |
| `application_approved` | `POST /api/v1/admin/applications/:id/approve` | wired |
| `application_rejected` | `POST /api/v1/admin/applications/:id/reject` | wired |
| `photo_rejected` | `POST .../photo-review` (`reject`) or `.../reject-photo` | wired |
| `temp_password` | `POST /api/v1/admin/users/:id/reset-password` | wired |
| `temp_password_admin` | `POST /api/v1/admin/admin-users/:id/reset-password` | wired |
| `board_reply` | `POST /api/v1/admin/board/posts/:id/reply` (`inquiry_answered` → 동일) | wired |
| `notice_marketing` | `POST /api/v1/admin/notices/:id/send-marketing` | wired |
| `member_info_changed` | `PATCH /api/v1/admin/users/:id` or `.../notify-changed` | wired |
| `password_expiry_reminder` | `POST /api/v1/auth/login` · `POST /api/v1/auth/google` (6개월+ , 30일 쿨다운) | wired |
| — | FO 접수 완료, 수험번호 부여 | **N/A** (policy — no template) |

Locale: `preferred_lang` from user row when available; signup uses request `preferred_lang` or `ko`.
Gap templates (`account_status`, `member_info_changed`, `password_expiry_reminder`) support **ko / my / en**.

### Admin login + BO actions (local)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin-dev@topik-mm.local","password":"DevOnly!2026"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Photo approve then application approve (application id from DB)
curl -s -X POST "http://localhost:3000/api/v1/admin/applications/1/photo-review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve"}'

curl -s -X POST "http://localhost:3000/api/v1/admin/applications/1/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

`readonly` admin role receives **403** on mutating routes. Dev `reset-password` responses may include `temporary_password` when `APP_ENV=development`.

Internal enqueue (manual replay / external workers — prefer domain triggers above):

```bash
curl -s -X POST http://localhost:3000/internal/notifications/enqueue \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Api-Key: your-secret' \
  -d '{"template_key":"notice_marketing","to_email":"user@example.com","locale":"ko","variables":{"noticeTitle":"제98회 안내","noticeCategory":"중요","publishedAt":"2026.07.17","noticeUrl":"https://example.com/notice.html?id=1"}}'
```

Password expiry smoke (demo user seed has `password_changed_at` 200 days ago):

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@topik-mm.local","password":"DemoUser!2026"}'
# → enqueues password_expiry_reminder once (check email_outbox / console log)
```

Marketing send smoke:

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/notices/1/send-marketing \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

When `INTERNAL_API_KEY` is unset, enqueue is allowed only in `APP_ENV=development`.

Render smoke test: `npx tsx scripts/render-email-templates.ts`

### Dev credentials

From `db/seed/dev_seed.sql`:

| Role | Email | Password |
|------|-------|----------|
| FO user | `demo@topik-mm.local` | `DemoUser!2026` |
| Super admin | `admin-dev@topik-mm.local` | `DevOnly!2026` |

### Login example

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@topik-mm.local","password":"DemoUser!2026"}'
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Hot reload (`tsx watch`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |
| `npm run migrate` | Apply `V001` schema (skip if `users` exists) + **dev** seed via psql |
| `npm run migrate:seed` | Dev seed only (idempotent) |
| `npm run migrate:prod` | Schema (if needed) + **prod** seed (reference data only, no demo/admin) |
| `npm run seed:prod` | Prod seed only (country/region codes, idempotent) |
| `npm run create-admin` | Create/update a BO admin (bcrypt, prompted/env — no hardcoded password) |

## Environment

See `.env.example`. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — token signing
- `CORS_ORIGINS` — allowed FO/BO origins (exact match). Development also allows `http://localhost:*` and `http://127.0.0.1:*`.
- `PUBLIC_FO_BASE` — FO origin used to build email deep links (password reset, etc.)
- `PUBLIC_BO_BASE` — BO origin for admin notification links (optional)
- `MAIL_SUPPORT` — support email shown in template footers (default `topik.myanmar@koica.go.kr`)
- `MAIL_ADMIN_TO` — operator inbox for `board_admin_new_post` alerts (optional; skip if unset)
- `STORAGE_PROVIDER` (`local` | `s3`) — photo/file storage driver (default `local`)
- `UPLOAD_DIR` — local disk root for photos (default `var/uploads`, gitignored)
- `UPLOAD_MAX_BYTES` — max decoded image size (default 5 MB)
- `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET` — required when `STORAGE_PROVIDER=s3`
  in the current FastAPI target; incomplete production S3 configuration must fail instead of falling back to local. Optional `S3_ENDPOINT` (MinIO/S3-compatible), `S3_PREFIX`.
- `INTERNAL_API_KEY` — protects `POST /internal/notifications/*` (dev: open when unset)
- `ENABLE_PASSWORD_EXPIRY_CRON` — `true`면 API 프로세스에서 매일 비밀번호 만료 배치 (선택; 기본은 로그인 훅)
- `MAIL_PROVIDER` (`console` | `smtp`) / `MAIL_FROM` /
  `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` — outbound email
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Sign-In. Blank = feature off
  (config endpoint returns `enabled:false`, `POST /auth/google` returns 503). Set
  `GOOGLE_CLIENT_ID` to a Google Cloud OAuth "Web application" client ID and register
  every FO origin under **Authorized JavaScript origins** to go live.

## Related

- `../db/README.md` — schema & Flyway
- `../docs/기능정의서/백엔드_스택_결정.md` — stack & phases
- `../docs/기능정의서/REST_API_명세_초안.md` — full API spec
