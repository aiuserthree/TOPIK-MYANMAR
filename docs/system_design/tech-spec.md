# TOPIK Myanmar — 개발 스펙 (Technical Spec)

> **문서 위치:** `docs/system_design/tech-spec.md`
> **기준일:** 2026-06-08
> **1차 근거:** [`docs/DEV_SPEC.md`](../DEV_SPEC.md) · 실제 코드 `apps/api/`, `db/migrations/`, `html/`
> **운영 절차:** [`docs/IWINV_SETUP.md`](../IWINV_SETUP.md) · [`docs/DEPLOY.md`](../DEPLOY.md)
> **상호 문서:** [개요](overview.md) · [DB 논리 명세](database.md)

본 문서는 `DEV_SPEC.md`(저장소 실제 파일 기준)를 1차 근거로, **시스템 설계 관점**에서 기술 스택·아키텍처·API·비기능 요구를 재구성한 개발 스펙입니다.

---

## 1. 확정 기술 스택

| 계층 | 기술 | 위치 | 상태 |
| --- | --- | --- | --- |
| **신규 Backend** | Python 3.11+ · FastAPI · SQLAlchemy(async) · asyncpg · Pydantic v2 | `apps/api` | **FO/BO API 대부분 구현** (정본) |
| **DB** | PostgreSQL 15+ **+ pgvector** | IwinV DB VPS | 운영 |
| **Object Storage** | IwinV S3 호환 (`https://kr.object.iwinv.kr`, `kr-standard`) | — | 운영 시 `STORAGE_PROVIDER=s3` |
| **신규 Frontend** | Vite 6 + React 19 + TypeScript + Tailwind CSS v4 | `apps/web` | **스캐폴드(홈 placeholder)** — 미사용 단계 |
| **실제 FO 화면** | **HTML + CSS + JavaScript (React 아님)** | `html/C안/FO` (25페이지) | 운영 FO 정본 |
| **실제 BO 화면** | React 18 + Babel **CDN** SPA(handoff) + `bo-api-bridge.js` | `html/C안/BO(admin)/project/` | 운영 BO 정본 |
| **레거시 API** | Node.js 20 · Fastify 4 · TypeScript | `api/` | 참조용(전체 소스 미동봉) |
| **운영 인프라** | nginx + systemd, IwinV VPS 2대(Web/DB) | — | 운영 확정 |
| **메일** | IwinV 테라웹메일 SMTP + `email_outbox` 워커 | — | DNS 확정 후 활성화 |

> **신규 화면 작업 기준(중요):** **신규/수정 화면은 HTML/CSS/JS(`html/C안/FO`, `html/C안/BO(admin)/project`)로 작업**합니다. `apps/web`(Vite+React)은 스캐폴드 단계로, FO 화면 이전은 중기 과제입니다. 현재 운영 FO/BO 화면은 정적 HTML 빌드(`build.py`/`build-bo.py`)로 배포합니다.

---

## 2. 시스템 아키텍처

### 2.1 레이어

```mermaid
flowchart TB
  subgraph FE [프레젠테이션 — 정적 HTML/CSS/JS]
    FO["FO (html/C안/FO)<br/>api-client.js"]
    BO["BO (BO·admin/project)<br/>bo-api-client.js / bo-api-bridge.js"]
  end
  subgraph API [애플리케이션 — FastAPI apps/api]
    R["routers/*<br/>auth·me·exam·applications·content·board·files·admin·health"]
    L["lib/*<br/>deps(RBAC)·security(JWT)·rev·storage·mail·email_worker·audit·roster_export"]
    M["models/*<br/>SQLAlchemy ORM"]
  end
  subgraph DATA [데이터]
    PG[(PostgreSQL 15 + pgvector)]
    S3[IwinV S3<br/>Private 버킷]
    SMTP[테라웹메일 SMTP]
  end
  FO -->|"/api/v1/*"| R
  BO -->|"/api/v1/admin/*"| R
  R --> L --> M --> PG
  L -->|"사진/첨부"| S3
  L -->|email_outbox 워커| SMTP
```

### 2.2 배포 토폴로지 (IwinV Web/DB 2 VPS)

```mermaid
flowchart LR
  CL[클라이언트<br/>브라우저] -->|HTTPS 443| NGX

  subgraph WEB [Web VPS · 115.68.222.58]
    NGX[nginx]
    UV[uvicorn :8000<br/>systemd myanmar-api]
    PUB["public/ (FO 정적)<br/>public-bo/ (BO 정적)<br/>또는 apps/web/dist"]
    NGX -->|"/ SPA fallback"| PUB
    NGX -->|"/api/ → 127.0.0.1:8000"| UV
  end

  subgraph DB [DB VPS · 115.68.227.1]
    PG[(PostgreSQL 15+pgvector<br/>topik_myanmar)]
  end

  UV -->|"5432 (Web IP만 허용)"| PG
  UV --> OBJ[IwinV S3<br/>kr.object.iwinv.kr]
  UV --> MAIL[테라웹메일 SMTP]
  ADM[관리 SSH<br/>39.115.174.100] -.SSH.-> WEB
  ADM -.SSH.-> DB
```

| 서버 | IP(문서 확정값) | 역할 |
| --- | --- | --- |
| Web | `115.68.222.58` | nginx + FastAPI(uvicorn:8000) + 정적 산출물 |
| DB | `115.68.227.1` | PostgreSQL 15+ (`5432`는 Web IP만 허용) |
| 관리 SSH | `39.115.174.100` | ELCAP·ufw SSH 허용 |

| 도메인(확정·미구매) | 대상 |
| --- | --- |
| `https://www.topik-myanmar.com` | FO (+ same-origin `/api/`) |
| `https://admin.topik-myanmar.com` | BO (+ same-origin `/api/` 프록시 필수) |

---

## 3. 폴더 구조

```text
Myanmar_v2.0/
├── apps/
│   ├── api/                     # FastAPI 신규 백엔드 (정본)
│   │   ├── app/
│   │   │   ├── main.py          # 앱·CORS·예외핸들러·lifespan(email worker)
│   │   │   ├── config.py        # Settings (DB·JWT·CORS·S3·MAIL·embedding)
│   │   │   ├── database.py      # async engine/session
│   │   │   ├── models/          # ORM (user, exam, application, content, board, admin, system, semantic, auth_tokens)
│   │   │   ├── lib/             # deps(RBAC)·security(JWT)·rev·storage·mail·email_*·audit·roster_export·validation
│   │   │   └── routers/         # health·auth·me·exam·applications·content·board·files·admin_api
│   │   ├── alembic/             # bootstrap revision 1개(빈 DB 전용)
│   │   ├── pyproject.toml / requirements.txt / .env.example
│   │   └── var/uploads/         # local 스토리지(개발)
│   └── web/                     # Vite + React 스캐폴드 (홈 placeholder)
├── html/
│   ├── C안/FO/                  # 운영 FO 정적 HTML (25페이지)
│   ├── C안/BO(admin)/project/   # 운영 BO handoff SPA (패널 13개)
│   └── shared/                  # api-client.js·bo-api-client.js·roster-codes.js
├── db/migrations/               # V001~V007 SQL (정본 스키마)
├── api/                         # Fastify 레거시(참조용, 일부 파일만)
├── packages/shared/             # 공통 상수 placeholder
├── scripts/                     # seed_dev/seed_prod/create_admin/test_* 등
├── 시안/email/                  # C안 이메일 14종 미리보기
├── build.py / build-bo.py       # FO/BO 정적 빌드
└── docs/                        # 운영·기능·설계 문서 (본 폴더 포함)
```

---

## 4. API 설계

### 4.1 설계 원칙

| 원칙 | 내용 |
| --- | --- |
| Base URL | `https://{host}/api/v1` (Health만 prefix 없음: `/health`, `/health/db`) |
| 포맷 | JSON(UTF-8). 표준 에러 `{"error":{"code","message","details?"}}` (최상위 `error`) |
| 경로 격리 | FO `/api/v1/*` · BO `/api/v1/admin/*`. BO는 admin JWT 필수, FO 토큰 접근 시 401/403 |
| 인증 | Bearer JWT (access 60분 / refresh 14일). `Authorization: Bearer` / `X-Access-Token` / 파일은 `?token=` 허용 |
| 동시성 | `If-Match: <rev>` 또는 body `rev` → 불일치 409 (`users`·`applications`) |
| 다국어 | `?lang=ko|my|en`(FAQ·약관), 메일 `locale` |
| 에러 코드 | 400 VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 409 CONFLICT·ALREADY_SUBMITTED / 423 ACCOUNT_LOCKED·LOCKED / 422 AGE_RESTRICTED |
| 페이지네이션 | `page`/`page_size` + `pagination{total_items,total_pages}` (목록별 상이) |

### 4.2 엔드포인트 표면 (실제 구현)

**Health / Auth (`/api/v1/auth`)**

| Method | Path | Auth | 설명 |
| --- | --- | --- | --- |
| GET | `/health`, `/health/db` | — | 상태·DB·pgvector 확인 |
| GET | `/auth/status` | — | API 핑 |
| GET | `/auth/google/config` | — | **`{enabled:false}`** (OAuth 미구현) |
| POST | `/auth/send-verification-code` | — | 가입 6자리 코드(5분), `email_outbox` |
| POST | `/auth/verify-email` | — | 코드 검증 → `verification_token` |
| POST | `/auth/register` | — | 프로필+사진(base64)+약관 → 가입·JWT |
| POST | `/auth/login` | — | FO/BO 공용(이메일로 자동 판별) |
| POST | `/auth/refresh` | refresh | access 재발급 |
| POST | `/auth/logout` | 선택 | 관리자는 감사 기록 |
| POST | `/auth/find-email` | — | 아이디 찾기(마스킹) |
| POST | `/auth/forgot-password` · `/verify-reset-code` · `/reset-password` | — | 비번 재설정(코드 30분→토큰) |

**FO (`/api/v1`)**

| Method | Path | Auth | 설명 |
| --- | --- | --- | --- |
| GET/PATCH | `/me` | 🔒user | 프로필(`rev`)·수정(사진 변경 시 진행 접수 재심사) |
| POST | `/me/change-password`, `/me/withdraw` | 🔒user | 비번 변경·탈퇴(접수 취소 연쇄) |
| GET | `/exam-rounds`, `/exam-venues` | — | 회차(수납기간 계산 포함)·활성 시험장 |
| GET/PUT/DELETE | `/application-draft` | 🔒user | 접수 임시저장(회원당 1건, 30일) |
| POST | `/application-submissions` | 🔒user | 4단계 제출(Ⅰ+Ⅱ 원자) |
| GET | `/applications` | 🔒user | 마이페이지(급수별 카드·배지) |
| POST | `/applications/{id}/cancel`, `/application-submissions/{id}/cancel` | 🔒user | 급수/그룹 취소(수납 전) |
| GET | `/notices`, `/notices/{id}`, `/faq`, `/terms`, `/terms/{type}` | — | 콘텐츠(공지 조회수↑, FAQ/약관 `?lang=`) |
| GET/POST | `/board/posts` | 🔒user | 게시판 목록·작성(비밀글) |
| GET | `/board/posts/{id}`, `/comments` | 🔒user | 상세·댓글(비밀글 잠금) |
| POST | `/board/posts/{id}/unlock`, `/comments`, `/board/attachments` | 🔒user | 비밀번호 열람·댓글·첨부 |
| GET | `/files/{id}` | 🔒(소유자) | 인증 프록시 스트림 |

**BO (`/api/v1/admin`)** — 모두 admin JWT (조회=`require_any_admin`(readonly 포함), 변경=`require_admin`(readonly 차단), 민감=`super`)

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | `/admin/applications`, `/applications/{id}` | any | 접수 그리드·상세(연명부 필드 조인) |
| POST | `/admin/applications/{id}/photo-review` | admin | 사진 승인/반려(If-Match) |
| POST | `/admin/applications/{id}/payment`, `/payment/cancel` | admin | 오프라인 수납·환불(수험번호 유지) |
| POST | `/admin/applications/{id}/approve`, `/reject` | admin | 승인·반려(메일) |
| POST | `/admin/exam-rounds/{id}/assign-exam-numbers` | **super** | 13자리 일괄 채번(dry_run 지원) |
| GET | `/admin/exam-rounds/{id}/roster.xlsx`, `/photos.zip`, `/admin/applications/photos.zip` | admin | 연명부 xlsx·사진 zip |
| GET | `/admin/exam-rounds`, `/exam-venues`, `/region-codes` | any | 마스터 조회 |
| POST/PATCH | `/admin/exam-rounds`(+status/revoke/restore), `/exam-venues` | **super** | 회차·시험장 CRUD |
| GET/POST/PATCH | `/admin/notices`(+attachments, send-marketing), `/faq` | admin | 콘텐츠 관리 |
| GET/POST/PATCH | `/admin/terms`(+publish/retire), `/terms/consents`, `/terms/{id}` | admin/**super**(게시·폐지) | 약관·동의 이력(CSV) |
| GET/POST/PATCH/DELETE | `/admin/board/posts`(+comments, reply, workflow) | any/admin | 게시판 관리(비밀글 열람=감사) |
| GET/PATCH | `/admin/users`, `/users/{id}`(+reset-password) | any/admin/**super**(정지·탈퇴) | 회원 관리(If-Match) |
| GET/POST/PATCH | `/admin/admin-users`(+reset-password) | **super** | 관리자 계정 |
| POST | `/admin/me/change-password` | admin(base) | 본인 비번 변경(최초 강제 해제) |
| GET | `/admin/audit-logs` | any | 처리 이력 |
| GET | `/admin/files/{id}` | admin | 관리자 파일 프록시 |

> **초안 대비 차이:** 초안 REST 명세의 일부 경로와 실제 구현이 다릅니다 — 가입 `/auth/signup`→**`/auth/register`**, 이메일 인증 `/auth/email/verify/*`→**`/auth/send-verification-code`·`/auth/verify-email`**, 채번 `.../exam-numbers/assign`→**`.../assign-exam-numbers`**(`mode:preview`→`dry_run`), 내보내기 Job 비동기 → **동기 스트리밍**(`roster.xlsx`/`photos.zip`). BO 로그인은 별도 `/admin/auth/login`이 아니라 **공용 `/auth/login`**. `/admin/dashboard/summary`·`/internal/notifications/*`는 **미구현**(대시보드는 `/admin/applications`+`/admin/board/posts` 조합).

### 4.3 인증·권한 모델

| 항목 | 구현 |
| --- | --- |
| 토큰 | JWT access(60분)/refresh(14일). `sub = "user:{id}"` / `"admin:{id}"`, claims `email`·`role` |
| FO 권한 | `require_user` — `role=user`만(admin 토큰 거부) |
| BO 권한 | `require_any_admin`(super/admin/readonly), `require_admin`(readonly 403), `_require_super`(super만) |
| 최초 비번 변경 | `must_change_password=true`면 `/admin/me/change-password` 외 차단(`PASSWORD_CHANGE_REQUIRED`) |
| 계정 잠금 | 로그인 5회 실패 → 30분 잠금(423) |
| 토큰 폐기 | 무상태 — 로그아웃은 클라이언트 토큰 폐기(서버 세션 테이블 없음) |

---

## 5. 파일/스토리지 · 이메일 · 동시성

### 5.1 파일/스토리지

| 항목 | 구현 |
| --- | --- |
| 프로바이더 | `STORAGE_PROVIDER=local`(기본, `var/uploads`) \| `s3`(IwinV) — `app/lib/storage.py` |
| storage_key | `local:{uuid}` 또는 `s3:{bucket}/{key}` (`S3_PREFIX/category/uuid`) |
| 증명사진 | 가입 시 base64 등록 → `file_attachments` + `users.photo_file_id`. 접수 시 행에 복사(`applications.photo_file_id`) |
| 업로드 제한 | 기본 5MB(`UPLOAD_MAX_BYTES`). 게시판 첨부 jpg/png/pdf, 공지 첨부 다양·10MB |
| 접근 제어 | **공개 URL 금지** — `GET /files/{id}`(본인·user_photo/application_photo) / `GET /admin/files/{id}`(관리자). 인증은 Bearer 또는 `?token=` |
| S3 안전장치 | `STORAGE_PROVIDER=s3`인데 키 누락 시 **기동 실패**(local 폴백 없음) |
| 사진 zip | 부여된 `exam_number` 기준 `{지역}/{시험장}/{TOPIK Ⅰ\|Ⅱ}/{수험번호}.jpg` + `_누락리포트.txt` |
| 연명부 | `roster.xlsx`(zip) — 지역·시험장·수준별 파일, 연락처·이메일 제외(11컬럼) |

### 5.2 이메일

| 항목 | 구현 |
| --- | --- |
| 큐 | `email_outbox`(`template_key`+`variables`+`locale`) → 발송 시 렌더 |
| 워커 | `ENABLE_EMAIL_WORKER=true` 시 백그라운드 drain(`email_worker.py`), 실패 재시도(`retry_count`/`next_retry_at`) |
| 발송 | `MAIL_PROVIDER=console`(개발, `dev_code` 응답) \| `smtp`(운영, 테라웹메일) |
| 렌더 | C안 THEME_C — `email_render.py`(인증 2종) + `email_templates.py`(KO 12종) + `email_templates_i18n.py`(MY/EN) |
| locale | 회원 `preferred_lang` 또는 요청 `lang`(기본 ko) |

**트랜잭션 메일 14종 `template_key`**

`signup_verify_code`, `password_reset`, `application_approved`, `application_rejected`, `photo_rejected`, `temp_password`, `temp_password_admin`, `board_refund_received`, `board_admin_new_post`, `board_reply`, `notice_marketing`, `account_status`, `member_info_changed`, `password_expiry_reminder`

> **미발송(정책):** FO 접수 완료, 수험번호 부여. **마케팅 공지**: 게시 시 `marketing_opt_in` 회원 일괄 발송(`POST /admin/notices/{id}/send-marketing`, 배치 상한 500).

### 5.3 동시성 (rev / If-Match / 409)

- 낙관적 잠금 컬럼 `rev`: **`users`, `applications`** (`app/lib/rev.py`).
- `expected_rev_from_request`: `If-Match` 헤더 → body `rev` 순으로 해석, `check_rev` 불일치 시 409, 성공 시 `bump_rev`.
- 적용: BO 사진심사·수납·승인·반려, 회원 수정 / FO 프로필 수정.
- 중복 접수: `UNIQUE(user_id, exam_round_id)` + IntegrityError 핸들러 → 409 `ALREADY_SUBMITTED`.

---

## 6. 비기능 요구

### 6.1 보안

| 항목 | 정책 |
| --- | --- |
| 비밀번호 | 8자+ 영문·숫자·특수문자(`is_valid_password`), bcrypt 해시 |
| 비밀번호 만료 | 180일 경과 시 로그인 시점 권고 메일(쿨다운 30일) |
| 계정 잠금 | 로그인 5회/30분(FO·BO), 비밀글 5회/30분 |
| 감사 로그 | BO 상태 변경·로그인/로그아웃·비밀글 열람·내보내기 → `admin_audit_logs`(IP 포함) |
| 운영 가드 | `APP_ENV=production` 시 약한 JWT/누락 시 기동 거부(`env_validate`), localhost CORS·`dev_code` 비활성 |
| CORS | 운영 origin 화이트리스트, 개발만 localhost 정규식 허용 |
| 민감 정보 | `password_hash`/`secret_password_hash` 응답 제외, 여권번호 미수집 |

### 6.2 다국어 / 성능 / 백업

| 항목 | 내용 |
| --- | --- |
| 다국어 | UI ko/my/en(`data-i18n`, MY→EN→KO 폴백), FAQ·약관·이메일 다국어. 공지 본문은 KO 단일(후속) |
| 성능 | 비동기(FastAPI/asyncpg), 접수 그리드 페이지네이션, pgvector HNSW(검색 후속). 대량 조회용 추가 인덱스는 합의/후속 |
| 백업 | DB VPS 일 1회 `pg_dump` cron(`/var/backups/topik_myanmar/`). RTO/RPO 미확정(합의) |
| 가용성 | 단일 Web/DB VPS(이중화 없음). 접수 기간 Feature Freeze(D-3~마감) |

---

## 7. 환경 · 로컬 개발 · 배포

### 7.1 환경 변수 요약 (`apps/api/.env`)

| 변수 | 필수 | 기본/예시 | 설명 |
| --- | --- | --- | --- |
| `APP_ENV` | — | `development` | `production` 시 운영 가드 활성 |
| `DATABASE_URL` | ○ | `postgresql+asyncpg://topik_app:***@HOST:5432/topik_myanmar` | async 연결 |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ○ | (32자+ 랜덤) | 약한 값+production 시 기동 거부 |
| `JWT_ACCESS_TTL_MINUTES` / `JWT_REFRESH_TTL_DAYS` | — | 60 / 14 | 토큰 수명 |
| `CORS_ORIGINS` | ○ | `https://www.topik-myanmar.com,https://admin.topik-myanmar.com` | 운영 origin |
| `STORAGE_PROVIDER` | — | `local` \| `s3` | s3 시 키 누락 기동 실패 |
| `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET`/`S3_ENDPOINT`/`S3_PREFIX` | s3 시 | `kr-standard`, `kr.object.iwinv.kr`, `photos` | IwinV S3 |
| `UPLOAD_DIR` / `UPLOAD_MAX_BYTES` | — | `var/uploads` / 5MB | local 저장 |
| `MAIL_PROVIDER` | — | `console` \| `smtp` | 운영 smtp |
| `MAIL_FROM` | — | `TOPIK Myanmar <noreply@topik-myanmar.com>` | 발신 |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS` | smtp 시 | `mail.topik-myanmar.com:587` | 테라웹메일 |
| `ENABLE_EMAIL_WORKER` | — | `false` | true 시 outbox drain |
| `PUBLIC_FO_BASE` | — | `https://www.topik-myanmar.com` | 메일 딥링크 |
| `MIN_SIGNUP_AGE_YEARS` | — | `14` | 최소 가입 연령 |
| `EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS`/`SEMANTIC_SEARCH_ENABLED` | — | `text-embedding-3-small`/1536/`false` | pgvector(후속) |

> 신규 Web(`apps/web/.env.local`): `VITE_API_URL=/api`. 레거시 정적 빌드: `TOPIK_API_BASE`(미설정 시 nginx same-origin `/api`).

### 7.2 로컬 개발 실행

**DB 준비 (V001~V007 순서)**

```bash
createdb topik_myanmar
for f in db/migrations/V00{1,2,3,4,5,6}__*.sql; do
  psql postgresql://localhost:5432/topik_myanmar -f "$f"
done
# V007(pgvector) — superuser + stdin (-f 는 postgres가 경로 열기 → 권한오류)
sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
```

**API**

```bash
cd apps/api
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**시드 + FO/BO 정적 서버** (다른 터미널)

```bash
python3 scripts/seed_dev.py        # 제107회 + 데모 FO/BO 계정 (super)
cd html/C안/FO && python3 -m http.server 8080            # FO
cd html/C안/BO\(admin\)/project && python3 -m http.server 8081   # BO
```

| 서비스 | URL | 데모 계정 |
| --- | --- | --- |
| FO | http://localhost:8080 | `demo@topik-mm.local` / `DemoUser!2026` |
| BO | http://localhost:8081/admin-login.html | `admin-dev@topik-mm.local` / `DevOnly!2026` (super) |
| API | http://localhost:8000 (`/health`) | — |

### 7.3 배포 (IwinV nginx + systemd)

```bash
# Web VPS (git pull 후)
python3 build.py        # FO → public/  (TOPIK_API_BASE 생략 = same-origin)
python3 build-bo.py     # BO → public-bo/
cd apps/api && pip install -r requirements.txt && sudo systemctl restart myanmar-api
sudo nginx -t && sudo systemctl reload nginx
# DB: V001~V007 psql 적용 / 운영 시드: CONFIRM_PROD_SEED=1 python3 scripts/seed_prod.py
# 첫 관리자: ADMIN_EMAIL=… ADMIN_PASSWORD=… python3 scripts/create_admin.py
```

| 항목 | 처리 |
| --- | --- |
| FO/BO 정적 | nginx `public/`·`public-bo/`(또는 `apps/web/dist/`), `/` SPA fallback |
| API | systemd `myanmar-api` → uvicorn `:8000`, nginx `/api/` 프록시(**FO·BO 양쪽**) |
| SSL | certbot `--nginx` (`www`·`admin`) |
| DB | DB VPS `5432` Web IP만, 일 1회 `pg_dump` cron |
| 운영 시드 | `seed_dev.py` 금지 → `seed_prod.py` + `create_admin.py` |

---

## 8. 미구현 / 다음 단계 / 고객사 확정 대기

### 8.1 미구현·후속

1. **Google OAuth** — `/auth/google/config`는 `enabled:false` 고정. 고객사 앱 등록 후 구현.
2. **공지 본문 다국어** — API `body_html`(KO) 단일, FO 언어별 본문 미구현.
3. **의미 검색/RAG** — `semantic_chunks` 스키마만 준비(`SEMANTIC_SEARCH_ENABLED=false`). 임베딩·검색 API 후속.
4. **`apps/web`(Vite+React) 이전** — 현재 스캐폴드. FO/BO 화면 이전은 중기.
5. **`/internal/notifications/*`** — 레거시 계약, 미등록.
6. **운영 SMTP 실발송** — 도메인·DNS(MX/SPF/DKIM) 확정 후.
7. **레거시 `api/`(Fastify)** — 참조용 잔존(전체 소스 미동봉), 신규 개발은 `apps/api` 기준.

### 8.2 고객사 확정 대기 ([정책_합의_워크시트](../기능정의서/정책_합의_워크시트.md))

| # | 항목 | 비고 |
| --- | --- | --- |
| 1 | 도메인 구매·DNS·오픈일 | `topik-myanmar.com` 확정·미구매 |
| 2 | SMTP 발신 주소·표시명·회신 주소 | 실메일 발송 전제 |
| 3 | **응시료 최종 금액·통화** | 정책 MMK(50,000/75,000) ↔ 실제 seed/코드 **USD 25** — 통화·금액 합의 필요 |
| 4 | 수납처 최종 안내 문구 | `rules-fee.html`·`apply-howto.html` 정적 반영 |
| 5 | 시험장·지역 목록 | BO 등록(seed 미포함) |
| 6 | 수험번호 공개 일시 | `exam_number_visible_at` |
| 7 | 합격자 발표일 | `result_date` |
| 8 | 약관·개인정보 법무 최종본 | `terms` 교체 |
| 9 | 운영·긴급 연락처 | — |
| 10 | Google 간편 로그인 사용 여부 | OAuth 구현 여부 |

> 1단계 확정 정책(2026-06-07): 제107회(접수 7/17~21·시험 10/18), 시험장 BO 등록, 응시료·수납처 FO 정적 문구, 마케팅 공지 일괄 메일, 동시성 rev/If-Match/409. 상세: [`DEV_SPEC.md` §15](../DEV_SPEC.md).
