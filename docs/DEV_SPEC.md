# TOPIK Myanmar 개발 스펙

> **기준일:** 2026-06-07  
> 이 문서는 저장소 실제 파일을 기준으로 작성했습니다. 재개발 방향은 [`MIGRATION.md`](../MIGRATION.md), IwinV 운영 절차는 [`IWINV_SETUP.md`](IWINV_SETUP.md)를 참고하세요.

---

## 1. 프로젝트 개요

**TOPIK Myanmar**는 미얀마 TOPIK 시험 접수·운영을 위한 웹 서비스입니다. 회원 가입, 시험 접수, 마이페이지(FO), 접수·회차·콘텐츠 관리(BO) 등의 기능을 제공합니다.

현재 저장소는 **재개발 스캐폴드 단계**입니다. 기존 정적 HTML FO/BO와 Node.js Fastify API(`api/`)는 보존·참조용으로 두고, 신규 화면·API는 `apps/web`(Vite + React)과 `apps/api`(FastAPI)에서 단계적으로 이전합니다. 운영 목표 환경은 IwinV VPS 2대(Web + DB)이며 nginx + systemd로 배포합니다.

| 구분 | 역할 | 상태 |
| --- | --- | --- |
| 신규 FO/BO | `apps/web` | 스캐폴드(홈 placeholder) |
| 신규 API | `apps/api` | FastAPI FO/BO API 대부분 구현 (auth·me·접수·콘텐츠·게시판·admin·파일·메일) |
| 레거시 FO/BO | `html/C안/` | FO 25페이지 HTML; BO UI·API 연동은 `BO(admin)/project/` (과거 `BO/` stub 디렉터리는 저장소에 없음) |
| 레거시 API | `api/` | README·일부 소스만 존재(전체 구현 미동봉) |
| DB 스키마 | `db/migrations/` | V001~V007 SQL migration 포함 |
| 이메일 시안 | `시안/email/` | C안 에디토리얼 14종 미리보기; API 렌더 `apps/api/app/lib/email_render.py` |

운영·배포 체크리스트는 [`DEPLOY.md`](DEPLOY.md), 상세 절차는 [`IWINV_SETUP.md`](IWINV_SETUP.md)를 따릅니다.

---

## 2. 확정 스택

| 계층 | 기술 | 비고 |
| --- | --- | --- |
| 신규 Frontend | Vite 6 + React 19 + TypeScript + Tailwind CSS v4 | `apps/web` |
| 신규 Backend | Python 3.11+ · FastAPI · SQLAlchemy(async) · asyncpg | `apps/api` |
| 레거시 Frontend | HTML + CSS + JavaScript | FO: `html/C안/FO` (React 없음); BO: `html/C안/BO(admin)/project/` (React 18 CDN + `bo-api-bridge.js`로 FastAPI 연동) |
| 레거시 Backend | Node.js 20 · Fastify 4 · TypeScript | `api/` |
| Database | PostgreSQL 15+ **+ pgvector** | IwinV DB VPS — FAQ/공지 의미 검색·RAG·중복 탐지용 |
| Object Storage | IwinV S3 호환 (`https://kr.object.iwinv.kr`) | 회원·접수 사진 |
| 운영 원칙 | nginx + systemd (IwinV VPS) | Web·DB 각각 네이티브 설치 |

---

## 3. 폴더 구조

```text
Myanmar_v2.0/
├── apps/
│   ├── web/                 # Vite + React 신규 프론트엔드
│   └── api/                 # FastAPI 신규 백엔드
├── api/                     # Fastify 레거시 API (일부 파일만 존재)
├── html/
│   ├── C안/
│   │   ├── FO/              # 레거시 FO 정적 HTML
│   │   └── BO(admin)/       # BO 화면 handoff + API 연동 (실제 UI·기능정의)
│   │       └── project/     # admin-login.html, admin.html, panels/*.jsx, shared/bo-api-client.js 등
│   └── shared/              # FO·BO 공통 JS (api-client.js, bo-api-client.js, roster-codes.js)
├── db/
│   └── migrations/          # PostgreSQL SQL migration
├── packages/
│   └── shared/              # 공통 상수 placeholder (@topik-myanmar/shared)
├── docs/                    # 운영·기능 문서
├── build.py                 # FO → public/ (IwinV nginx 정적)
├── build-bo.py                # BO → public-bo/ (IwinV nginx 정적)
├── MIGRATION.md             # 재개발 스캐폴드 요약
└── README.md
```

---

## 4. 신규 스택 (`apps/web`, `apps/api`)

### 4.1 `apps/web` — Vite + React

**의존성** (`apps/web/package.json`):

- React 19, React Router 7, Vite 6, TypeScript 5, Tailwind CSS 4, ESLint 9

**주요 설정:**

| 항목 | 값 |
| --- | --- |
| dev 포트 | `5173` |
| API 프록시 | `/api` → `http://127.0.0.1:8000` (경로 rewrite로 `/` 접두사 제거) |
| path alias | `@` → `./src` |
| 빌드 산출물 | `apps/web/dist/` |

**현재 구현:**

- `src/pages/Home.tsx` — 스택 소개 placeholder 1페이지
- `src/App.tsx` — `/` 라우트만 등록
- React Router + Tailwind 기반 레이아웃

**환경 변수** (`.env.example` → 로컬은 `.env.local`):

```env
VITE_API_URL=/api
```

### 4.2 `apps/api` — FastAPI

**의존성** (`pyproject.toml` / `requirements.txt`):

- fastapi, uvicorn[standard], sqlalchemy, asyncpg, pydantic-settings
- python-jose[cryptography], passlib[bcrypt], bcrypt, alembic

**앱 구조:**

```text
apps/api/
├── app/
│   ├── main.py          # FastAPI 앱, CORS, lifespan(email worker)
│   ├── config.py        # DB·JWT·CORS·S3·MAIL_* 설정
│   ├── database.py      # SQLAlchemy async engine/session
│   ├── models/          # User, Application, Exam, Content, Board, Admin, EmailOutbox 등
│   ├── lib/             # mail, email_render, storage, security, audit, email_worker
│   └── routers/
│       ├── health.py    # /health, /health/db
│       ├── auth.py      # FO/BO 로그인, 가입, 인증메일, 비번재설정
│       ├── me.py        # /me, change-password, withdraw
│       ├── exam.py      # exam-rounds, exam-venues
│       ├── applications.py
│       ├── content.py   # notices, faq, terms
│       ├── board.py     # FO 게시판
│       ├── files.py     # 파일 프록시
│       └── admin_api.py # BO /admin/*
├── alembic/             # ORM migration (revision 1개 — 신규 빈 DB bootstrap용)
├── alembic.ini
├── pyproject.toml
├── requirements.txt
└── .env.example
```

**구현된 엔드포인트 (요약):**

| 영역 | Path prefix | 상태 |
| --- | --- | --- |
| Health | `/health`, `/health/db` | 구현 |
| Auth | `/api/v1/auth/*` (login, refresh, register, verify, forgot/reset) | 구현 (Google OAuth `enabled: false`) |
| Me | `/api/v1/me/*` | 구현 |
| Exam | `/api/v1/exam-rounds`, `/exam-venues` | 구현 |
| Application | `/api/v1/application-draft`, `application-submissions`, `applications` | 구현 |
| Content | `/api/v1/notices`, `/faq`, `/terms` | 구현 |
| Board | `/api/v1/board/*` | 구현 |
| Files | `/api/v1/files/:id`, `/admin/files/:id` | 구현 (local/S3) |
| Admin | `/api/v1/admin/*` (접수·회차·시험장·콘텐츠·게시판·회원·관리자·감사) | 구현 |
| Export | `roster.xlsx`, `photos.zip` | **구현** (`GET /admin/exam-rounds/{id}/roster.xlsx`, `photos.zip`) |
| Find email | `POST /auth/find-email` | **구현** |
| Marketing mail | `POST /admin/notices/{id}/send-marketing` | **구현** |
| Internal | `/internal/notifications/*` | **미구현** |

**환경 변수** (`.env.example`):

```env
DATABASE_URL=postgresql+asyncpg://topik_app:change_me@127.0.0.1:5432/topik_myanmar
JWT_SECRET=change-this-to-a-long-random-secret
JWT_REFRESH_SECRET=change-this-to-another-long-random-secret
CORS_ORIGINS=http://localhost:5173,...
MAIL_PROVIDER=console          # 운영: smtp (IwinV 테라웹메일)
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
PUBLIC_FO_BASE=https://www.topik-myanmar.com
# STORAGE_PROVIDER, S3_* — IWINV_SETUP.md §5
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — IWINV_SETUP.md §6
```

FastAPI/SQLAlchemy async 연결은 `postgresql+asyncpg://` 형식을 사용합니다.

### 4.3 이메일 (시안 + API)

| 경로 | 역할 |
| --- | --- |
| `시안/email/` | C안 에디토리얼 HTML 미리보기 (`templates/data.js`, `render.js`, `index.html`) — **14종** `template_key` 정의 |
| `apps/api/app/lib/email_render.py` | 프로덕션 HTML 렌더 (C안 THEME_C 레이아웃) |
| `apps/api/app/lib/email_templates.py` | 트랜잭션 메일 12종 KO 레이아웃 |
| `apps/api/app/lib/email_templates_i18n.py` | 동일 12종 MY/EN 레이아웃 |
| `apps/api/app/lib/email_notify.py` | 접수·게시판·계정 등 도메인 이벤트 → outbox enqueue |
| `apps/api/app/lib/mail.py` | `email_outbox` enqueue·SMTP/console 발송·재시도 |
| `apps/api/app/lib/email_worker.py` | `ENABLE_EMAIL_WORKER=true` 시 백그라운드 drain |
| `scripts/test_smtp.py` | SMTP 설정·발송 스모크 (`apps/api/.env` 사용) |

**14종 `template_key` (API 렌더·ko/my/en):**

`signup_verify_code`, `password_reset`, `application_approved`, `application_rejected`, `photo_rejected`, `temp_password`, `temp_password_admin`, `board_refund_received`, `board_admin_new_post`, `board_reply`, `notice_marketing`, `account_status`, `member_info_changed`, `password_expiry_reminder`

- 인증 2종: `email_render.py`의 `SIGNUP_VERIFY_LAYOUTS` / `PASSWORD_RESET_LAYOUTS`
- 나머지 12종: `email_templates.py`(KO) + `email_templates_i18n.py`(MY/EN) → `render_transactional()`
- 발송 locale: 회원 `preferred_locale` 또는 요청 `lang` (기본 `ko`)

**운영 발송:** IwinV 테라웹메일 SMTP (`MAIL_PROVIDER=smtp`, `noreply@topik-myanmar.com`). 개발 기본은 `console` — 인증 코드는 API 응답 `dev_code`로 확인. 상세: [`IWINV_SETUP.md`](IWINV_SETUP.md) §6, 시안: [`시안/email/README.md`](../시안/email/README.md).

---

## 5. 레거시 스택 (`api/`, `html/`)

### 5.1 레거시 API (`api/`)

**설계:** Node.js 20 + Fastify 4 + TypeScript. 기본 포트 `3000` (`api/.env.example`의 `PORT`).

**저장소 현황 (2026-06-05 기준):**

- `api/README.md` — 전체 REST API 명세·운영 가이드(가장 완전한 계약 문서)
- `api/.env.example` — 레거시 환경 변수 전체
- `api/src/index.ts` — 다수 route 모듈 import (health, auth, admin, files 등)
- **실제 존재하는 route 파일:** `auth-signup.ts`, `application-drafts.ts`, `me.ts` 3개뿐
- `api/package.json`, `api/scripts/`, 대부분의 `api/src/routes/`·`api/src/lib/` — **저장소에 없음**
- 레거시 셀프호스트 배포 스크립트는 저장소에 없음(전체 소스 필요)

로컬에서 `api/`를 실행하려면 README가 가리키는 전체 소스 트리가 필요합니다. 현재 워크스페이스만으로는 `npm run dev`가 불가능합니다.

**레거시 API 계약 요약** (`api/README.md` 기준):

- FO: `/api/v1/auth/*`, `/api/v1/me`, `/api/v1/application-*`, `/api/v1/notices`, `/api/v1/faq`, `/api/v1/terms`, `/api/v1/board/*`, `/api/v1/files/:id`
- BO: `/api/v1/admin/*` (접수·회차·시험장·공지·FAQ·약관·회원 관리)
- Internal: `/internal/notifications/*`
- Health: `/health`, `/health/db`

상세 엔드포인트 표는 [`api/README.md`](../api/README.md)를 참고하세요.

### 5.2 레거시 Frontend (`html/`)

**FO** (`html/C안/FO/`) — 정적 HTML + CSS + JS (React 없음), **25개 HTML 페이지**. 전체 IA·메뉴 매핑은 [`html/C안/FO/docs/00_IA.md`](../html/C안/FO/docs/00_IA.md) 참고.

| 구분 | 파일 | 용도 |
| --- | --- | --- |
| 홈 | `index.html` | 메인 |
| 계정 | `login.html`, `signup.html`, `password-reset.html`, `mypage.html`, `mypage-profile.html` | 로그인·가입·비번재설정·마이페이지·프로필 |
| 접수 | `register.html`, `apply-howto.html`, `ticket.html` | 시험 접수·접수 안내·수험표 |
| TOPIK 안내 | `guide-overview.html`, `guide-intro.html`, `guide-questions.html`, `guide-evaluation.html` | 안내 4종 |
| TOPIK 규정 | `rules-notice.html`, `rules-answer.html`, `rules-fee.html`, `rules-id.html` | 규정 4종 |
| 게시판 | `notice.html`, `faq.html`, `qna.html`, `refund-correction.html` | 공지·FAQ·문의·환불·정정 |
| 약관 | `terms.html`, `privacy.html`, `marketing.html` | 약관 본문 |
| 기타 | `404.html` | 에러 |

**BO handoff + API 연동** (`html/C안/BO(admin)/project/`) — 실제 BO 화면·IA 기준. `assets/bo-api-bridge.js`가 `TopikBoApi`로 FastAPI를 호출하며, API 실패 시 빈 목록 + `apiError` 표시(목 데이터 폴백 없음):

| 경로 | 용도 |
| --- | --- |
| `admin-login.html` | 관리자 로그인 |
| `admin.html` | SPA 셸 (패널 라우팅) |
| `assets/admin.css`, `assets/app.jsx`, `assets/common.jsx`, `assets/data.js` | 레이아웃·라우팅·목 데이터 |
| `panels/*.jsx` | 기능 패널 13개 (아래 표; 사진 검수는 `applicants.jsx`에 통합) |
| `shared/topik-bo-core.js`, `topik-export.js`, `topik-i18n-content.js`, `topik-lib-loader.js`, `topik-mail.js` | BO 공통 유틸 |
| `docs/`, `uploads/` | 기능정의서·IA·FO handoff 참고 자료 |

**패널 목록** (`panels/`):

| 파일 | 기능 |
| --- | --- |
| `dashboard.jsx` | 대시보드 |
| `applicants.jsx` | 접수·사진 검수 관리 |
| `sessions.jsx` | 회차 관리 |
| `venues.jsx` | 시험장 관리 |
| `notices.jsx` | 공지 관리 |
| `faq.jsx` | FAQ 관리 |
| `refunds.jsx` | 환불 관리 |
| `inquiries.jsx` | 1:1 문의 |
| `members.jsx` | 회원 관리 |
| `terms.jsx` | 약관 관리 |
| `admins.jsx` | 관리자 계정 |
| `permissions.jsx` | 권한 관리 |
| `audit.jsx` | 처리 이력 |

React 18 + Babel CDN 기반 SPA. **운영:** `admin-login.html`·`admin.html`에 `topik-api-base` meta **없음** — nginx same-origin `/api`. **로컬:** `TOPIK_API_BASE=http://127.0.0.1:8000 python3 build-bo.py` 또는 meta 주입. 신규 BO는 최종적으로 `apps/web`으로 이전할 예정입니다.

**과거 `html/C안/BO/` stub** — 저장소에 **디렉터리 없음** (README·DEPLOY.md의 `login.html` 등 레거시 경로는 미동봉). `build-bo.py` 입력은 `BO(admin)/project/`입니다.

**공통** (`html/shared/`):

- `api-client.js` — FO API 클라이언트
- `bo-api-client.js` — BO `/api/v1/admin/*` 클라이언트
- `roster-codes.js` — 연명부·시험장 코드 상수 (FO·BO export 공용)

### 5.3 레거시 정적 빌드

| 스크립트 | 입력 | 출력 | 용도 |
| --- | --- | --- | --- |
| `build.py` | `html/C안/FO` + `html/shared` | `public/` | IwinV FO nginx 정적 |
| `build-bo.py` | `html/C안/BO(admin)/project/` + `html/shared` (+ BO `shared/` 병합) | `public-bo/` | IwinV BO nginx 정적 |

`build-bo.py`는 실제 BO UI인 `html/C안/BO(admin)/project/`를 우선 복사하고, `html/shared/`와 BO 자체 `shared/`를 `public-bo/shared/`로 병합합니다. 운영에서 `TOPIK_API_BASE`를 생략하면 nginx 동일 origin `/api`를 사용하고, 별도 API origin이 필요할 때만 meta를 주입합니다.

환경 변수 `TOPIK_API_BASE`로 API base URL을 HTML `<meta name="topik-api-base">`에 주입합니다. **미설정 시 meta 미주입** — IwinV nginx 동일 origin `/api` 사용. 로컬 FastAPI 테스트 시 `TOPIK_API_BASE=http://127.0.0.1:8000`으로 빌드합니다.

---

## 6. 데이터베이스

### 6.1 Migration 파일

**저장소에 포함된 파일 (V001~V007):**

| 파일 | 내용 |
| --- | --- |
| `V001__initial_schema.sql` | users, exam_rounds, exam_venues, applications, admin_users, notices, faq, terms 등 |
| `V002__email_outbox_retry.sql` | `email_outbox` 재시도 컬럼 |
| `V003__bo_integration.sql` | BO 연동 스키마 |
| `V004__user_last_login.sql` | `users.last_login_at` |
| `V005__application_drafts.sql` | `application_drafts` (user당 1건, JSONB, 30일 TTL) |
| `V006__fo_contract_and_security.sql` | 지역별 시험장코드, 로그인/비밀글 잠금, 약관 동의 이력 |
| `V007__pgvector_semantic_search.sql` | **pgvector extension**, `semantic_chunks` (FAQ/공지/RAG/중복접수 embedding) |

운영·로컬 모두 **V001 → V007 순서**로 `psql -f` 적용 ([`IWINV_SETUP.md`](IWINV_SETUP.md) §2.4.1·§2.8). V007의 `CREATE EXTENSION vector`는 **postgres superuser**로 실행하며, IwinV 등에서는 `sudo -u postgres psql -f` 대신 **stdin**(`< 절대경로`)을 사용합니다(`-f`는 OS user `postgres`가 경로를 열어 `/root` 등에서 `Permission denied`). Alembic `20260606_0001` revision은 신규 빈 DB bootstrap용이며, 운영 적용 절차의 기준은 SQL migration입니다.

### 6.2 스키마 개요 (문서·V005 기준)

- **V001(문서 기준):** `users`, `exam_rounds`, `exam_venues`, `applications`, `admin_users`, `notices`, `faq_items`, `terms`, `country_region_codes` 등
- **V005:** `application_drafts` — FO `register.html` 접수 임시저장
- **V006:** 로그인 잠금, 비밀글 잠금, 지역별 시험장코드 UNIQUE, `terms_consents`
- **V007:** pgvector + `semantic_chunks` — `source_type`(notice/faq/board_post/application/terms/rag_corpus), 다국어·청크 단위 embedding, HNSW(cosine) 인덱스. **API embedding/sync·검색 엔드포인트는 후속 단계** (`SEMANTIC_SEARCH_ENABLED=false` 기본)

### 6.2.1 pgvector (의미 검색·RAG)

| 항목 | 값 |
| --- | --- |
| Extension | `vector` (pgvector) |
| Embedding 테이블 | `semantic_chunks` |
| 차원 | 1536 (OpenAI `text-embedding-3-small` 호환, `EMBEDDING_DIMENSIONS`) |
| 유사도 | cosine (`vector_cosine_ops`, HNSW) |
| 로컬 DB | PostgreSQL 15 + `postgresql-15-pgvector` (또는 IwinV DB VPS 원격 연결) |
| Health | `GET /health/db` → `"pgvector": true/false` |

**예정 기능 (스키마만 준비):** FAQ/공지 의미 검색, RAG 챗봇, 게시판 유사 문의·중복 접수 탐지.

### 6.3 연결 문자열 형식

| 용도 | 형식 예시 |
| --- | --- |
| FastAPI (async) | `postgresql+asyncpg://topik_app:PASSWORD@HOST:5432/topik_myanmar` |
| psql / Fastify | `postgresql://topik_app:PASSWORD@HOST:5432/topik_myanmar` |
| 레거시 로컬 dev | `postgresql://topik:topik_dev@localhost:5432/topik_mm_dev` |

### 6.4 Alembic

`apps/api/alembic/versions/20260606_0001_initial_schema.py` — ORM `metadata.create_all` bootstrap revision **1개** 존재. **운영·로컬 DB 적용 기준은 SQL migration(V001~V007)**이며, 이미 V001~V007이 적용된 DB에 Alembic revision을 섞지 않습니다. 신규 빈 DB 로컬 부트스트랩·ORM 스냅샷용으로만 사용합니다.

---

## 7. 인프라 (IwinV) 요약

상세 절차는 [`IWINV_SETUP.md`](IWINV_SETUP.md)를 따릅니다.

### 7.1 서버 구성

| 서버 | IP (문서 확정값) | 역할 |
| --- | --- | --- |
| Web | `115.68.222.58` | nginx + FastAPI + Vite `dist/` |
| DB | `115.68.227.1` | PostgreSQL 15+ |
| 관리자 SSH | `39.115.174.100` | ELCAP·ufw SSH 허용 |

### 7.2 Web 서버 런타임

- Node.js 20 LTS (빌드용), Python 3.11 (FastAPI), nginx, certbot
- FastAPI: systemd `myanmar-api` → `uvicorn app.main:app --host 127.0.0.1 --port 8000`
- Frontend: `apps/web/dist/` 정적 제공 (Node 프로세스 불필요)
- nginx: `/` → SPA fallback, `/api/` → `127.0.0.1:8000/` 프록시

### 7.3 DB 서버

- PostgreSQL, `topik_myanmar` DB, `topik_app` 앱 계정
- `5432`는 Web 서버 IP(`115.68.222.58`)만 허용
- 일일 `pg_dump` cron 백업 (`/var/backups/topik_myanmar/`)

### 7.4 오브젝트 스토리지

- 엔드포인트: `https://kr.object.iwinv.kr`, 리전: `kr-standard`
- 운영 시 `STORAGE_PROVIDER=s3` + Private 버킷 (공개 URL 없음, `GET /files/:id`·`/admin/files/:id` API 프록시)
- `apps/api/app/lib/storage.py`: `local`(`var/uploads`) / `s3`(boto3, IwinV S3 호환) read·write·delete 구현
- 변수: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET`, `S3_ENDPOINT`, `S3_PREFIX`

### 7.5 앱 배치 경로

- 저장소 클론: `/opt/myanmar-v2`
- 환경 파일: `apps/api/.env`, `apps/web/.env.production` (권한 `600`)

---

## 8. 환경 변수 전체

### 8.1 신규 FastAPI (`apps/api/.env.example`)

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | ○ | `postgresql+asyncpg://…` |
| `JWT_SECRET` | ○ | access JWT 서명 키 |
| `JWT_REFRESH_SECRET` | ○ | refresh JWT 서명 키 |
| `CORS_ORIGINS` | ○ | 쉼표 구분 origin (운영: `https://www.topik-myanmar.com,https://admin.topik-myanmar.com`) |
| `STORAGE_PROVIDER` | — | `local`(기본) \| `s3` |
| `UPLOAD_DIR` | — | local 저장 경로 (기본 `var/uploads`) |
| `UPLOAD_MAX_BYTES` | — | 최대 업로드 (기본 5MB) |
| `S3_BUCKET` | s3 시 | IwinV 버킷명 |
| `S3_REGION` | s3 시 | `kr-standard` |
| `S3_ACCESS_KEY` | s3 시 | IwinV Access Key |
| `S3_SECRET` | s3 시 | IwinV Secret Key |
| `S3_ENDPOINT` | s3 시 | `https://kr.object.iwinv.kr` |
| `S3_PREFIX` | — | 객체 키 prefix (예: `photos`) |
| `MAIL_PROVIDER` | — | `console`(개발) \| **`smtp`(운영·IwinV 테라웹메일)** |
| `MAIL_FROM` | — | 발신 주소 — 운영 `TOPIK Myanmar <noreply@topik-myanmar.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | smtp 시 | 테라웹메일 SMTP ([IWINV_SETUP.md](IWINV_SETUP.md) §6) |
| `ENABLE_EMAIL_WORKER` | — | `true` 시 백그라운드 `email_outbox` drain |
| `PUBLIC_FO_BASE` | — | 메일·딥링크용 FO URL |
| `MIN_SIGNUP_AGE_YEARS` | — | 가입 최소 연령 (기본 14) |

### 8.2 신규 Web (`apps/web/.env.example` → `.env.local`)

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `VITE_API_URL` | ○ | API base (`/api` 또는 절대 URL) |

### 8.3 레거시 Fastify (`api/.env.example`)

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `PORT` | — | 기본 `3000` |
| `APP_ENV` | — | `development` \| `production` |
| `DATABASE_URL` | ○ | `postgresql://…` |
| `JWT_SECRET` | ○ | access token |
| `JWT_REFRESH_SECRET` | ○ | refresh token |
| `JWT_ACCESS_EXPIRES` | — | 기본 `15m` |
| `JWT_REFRESH_EXPIRES` | — | 기본 `7d` |
| `CORS_ORIGINS` | ○ | FO origin 목록 |
| `PUBLIC_FO_BASE` | ○ | 이메일 딥링크용 FO URL |
| `PUBLIC_BO_BASE` | — | BO URL |
| `STORAGE_PROVIDER` | — | `local` \| `s3` |
| `UPLOAD_DIR` | — | local 저장 경로 |
| `UPLOAD_MAX_BYTES` | — | 최대 업로드 (기본 5MB) |
| `S3_*` | s3 시 | 버킷·리전·키·엔드포인트 |
| `GOOGLE_CLIENT_ID` | — | 비우면 Google 로그인 OFF |
| `GOOGLE_CLIENT_SECRET` | — | 선택 |
| `MAIL_PROVIDER` | — | `console` \| `smtp` — **운영 권장:** `smtp` (IwinV 테라웹메일, [IWINV_SETUP.md](IWINV_SETUP.md) §6) |
| `MAIL_FROM` | — | 발신 주소 — **운영 확정:** `TOPIK Myanmar <noreply@topik-myanmar.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | smtp 시 | IwinV 테라웹메일 SMTP 접속 정보 (예: `mail.topik-myanmar.com:587`, `SMTP_USER=noreply@topik-myanmar.com`) |
| `MAIL_SUPPORT` | — | 템플릿 footer 지원 메일 |
| `MAIL_ADMIN_TO` | — | 운영자 알림 수신 |
| `INTERNAL_API_KEY` | — | internal notification 보호 |
| `ENABLE_PASSWORD_EXPIRY_CRON` | — | 일일 비밀번호 만료 배치 |
| `ENABLE_EMAIL_WORKER` | — | email_outbox drain worker |

---

## 9. 로컬 개발 실행

### 9.1 신규 스택 (권장 개발 경로)

**PostgreSQL 준비** — DB가 없으면 생성 후 V001~V007 순서 적용:

```bash
createdb topik_myanmar
for f in db/migrations/V00{1,2,3,4,5,6}__*.sql; do
  psql postgresql://localhost:5432/topik_myanmar -f "$f"
done
# V007 (pgvector) — superuser 필요. stdin: 현재 셸이 파일 읽음 (-f 는 postgres 가 경로 열기)
sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
# IwinV: /opt/myanmar-v2/db/migrations/V007__pgvector_semantic_search.sql 절대경로 — IWINV_SETUP.md §2.8
```

**API:**

```bash
cd apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**시드·스모크** (저장소 루트, 다른 터미널 — `apps/api/.env`의 `DATABASE_URL` 사용):

```bash
python3 scripts/seed_dev.py        # 제107회 회차 + 데모 FO/BO 계정
python3 scripts/test_phase1_flow.py
```

**Web:**

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

**확인:**

- Web: http://localhost:5173
- API health: http://localhost:8000/health
- Auth placeholder: http://localhost:8000/api/v1/auth/status

Vite dev server는 `/api`를 FastAPI(`127.0.0.1:8000`)로 프록시합니다.

### 9.2 레거시 FO/BO HTML (현재 화면 개발·검증 경로)

FastAPI(`:8000`)를 띄운 뒤, 소스 디렉터리에서 정적 서버로 FO/BO를 엽니다 (`로컬 서버 확인.txt`와 동일).

**FO:**

```bash
cd html/C안/FO
python3 -m http.server 8080
# http://localhost:8080/index.html
```

**BO:**

```bash
cd html/C안/BO\(admin\)/project
python3 -m http.server 8081
# http://localhost:8081/admin-login.html
```

| 항목 | 값 |
| --- | --- |
| FO URL | http://localhost:8080 |
| BO URL | http://localhost:8081 |
| API URL | http://localhost:8000 |
| FO 데모 계정 | `demo@topik-mm.local` / `DemoUser!2026` (seed 후) |
| BO 데모 계정 | `admin-dev@topik-mm.local` / `DevOnly!2026` (seed 후) |

**`TOPIK_API_BASE` / meta:**

| 클라이언트 | API base 결정 |
| --- | --- |
| BO handoff | 로컬: `TOPIK_API_BASE=http://127.0.0.1:8000 python3 build-bo.py` 또는 meta 주입 |
| FO 소스 직접 서빙 | 동일 origin이 아니므로 `build.py` 시 `TOPIK_API_BASE=http://127.0.0.1:8000`로 meta 주입, 또는 페이지 로드 전 `window.TOPIK_API_BASE = 'http://127.0.0.1:8000'` |
| IwinV 운영 | `TOPIK_API_BASE` 생략 → nginx 동일 origin `/api` (meta 미주입) |

`apps/api` CORS 기본값에 `http://localhost:8080`, `http://localhost:8081`(및 `127.0.0.1` 동일 포트)이 포함됩니다.

### 9.3 레거시 Fastify API (`api/`)

레거시 API 전체 소스·`package.json`이 저장소에 없어 현재 워크스페이스에서는 실행 불가합니다. [`api/README.md`](../api/README.md) 및 [`api/로컬실행_가이드.md`](../api/로컬실행_가이드.md)는 전체 트리 기준 가이드입니다.

---

## 10. API 현황

### 10.1 신규 FastAPI (`apps/api`)

| 상태 | 범위 |
| --- | --- |
| **구현됨 (1단계)** | Health, FO/BO auth, `find-email`, me(rev/If-Match), exam-rounds/venues(`payment_*`·`result_announcement_date`), application-draft/submissions, notices/faq/terms, board, files, admin 전반, **roster.xlsx**·**photos.zip** export, **마케팅 공지 일괄 메일**, **이메일 14종 렌더+도메인 트리거(ko/my/en)**, **optimistic locking(rev/409)** |
| **부분** | Google OAuth (`enabled: false`), `/internal/notifications/*`(레거시 계약, 미등록) |
| **미구현/보류** | Google login/register, 운영 SMTP 실발송(도메인·DNS 확정 후) |

FO는 `html/C안/FO/shared/api-client.js`(빌드 시 `html/shared` 병합), BO는 `BO(admin)/project/shared/bo-api-client.js`로 FastAPI(`:8000`) 연동. 응시료·수납처 안내 페이지(`rules-fee.html`, `apply-howto.html`)는 **정적 문구** — API/DB 연동 없음(아래 §15).

### 10.2 레거시 Fastify (`api/`)

**문서상 구현 완료** (`api/README.md`):

- 인증: login, Google OAuth, signup, password reset
- FO: me, application-draft/submissions, notices, faq, terms, board, files
- BO admin: applications, exam-rounds/venues, notices, faq, terms, users, photo-review, payment, exam-number assign, roster/photos export
- Internal notifications enqueue

**저장소에 남아 있는 route 소스:**

- `routes/auth-signup.ts`
- `routes/application-drafts.ts`
- `routes/me.ts`

---

## 11. 프론트 현황

### 11.1 신규 (`apps/web`)

| 항목 | 상태 |
| --- | --- |
| 라우팅 | `/` Home placeholder |
| 스타일 | Tailwind CSS v4, 다크 테마 |
| API 연동 | 프록시 설정만 (`VITE_API_URL=/api`), 실제 fetch 미구현 |
| FO 화면 이전 | 미착수 |

### 11.2 레거시 FO (`html/C안/FO`)

**25개** HTML 페이지 존재 (목록·IA: [`html/C안/FO/docs/00_IA.md`](../html/C안/FO/docs/00_IA.md), 상세: [`PROJECT_REVIEW.md`](PROJECT_REVIEW.md) §A).

| 항목 | 상태 |
| --- | --- |
| UI 다국어 (KO/MY/EN) | 25페이지 공통 GNB·`data-i18n`/`data-i18n-content` + `shared/topik-i18n-content.js` (MY→EN→KO 폴백) |
| API 연동 | `shared/api-client.js` — auth·접수·게시판·콘텐츠·`find-email` 등 |
| API 콘텐츠 다국어 | FAQ `?lang=` 지원; 공지 본문은 API `body_html`(KO) 단일 — FO 언어별 본문 전환 **미구현** |
| 정적 빌드 | `build.py` — `html/shared` + FO `shared/` 병합 후 `public/` |

### 11.3 레거시 BO

| 경로 | 상태 |
| --- | --- |
| `html/C안/BO(admin)/project/` | **handoff + API 연동** — 패널 13개, `bo-api-bridge.js`·`TopikBoApi`, 연명부 xlsx·photos.zip export |
| `html/C안/BO/` | **삭제됨** — 과거 stub 경로, 저장소에 없음 |

운영 BO는 `apps/web` 이전 전까지 IwinV에서 handoff 정적 제공 — 확정 도메인 `https://admin.topik-myanmar.com` ([`IWINV_SETUP.md`](IWINV_SETUP.md) §1.11).

### 11.4 공유 패키지 (`packages/shared`)

`PROJECT_NAME = "TOPIK Myanmar"` placeholder. 향후 FO/BO 공통 타입·상수용.

---

## 12. 빌드/배포

### 12.1 신규 스택 — IwinV (목표 운영)

[`IWINV_SETUP.md`](IWINV_SETUP.md) §1~§3:

```bash
# Web 서버
cd /opt/myanmar-v2/apps/web && npm ci && npm run build   # → dist/
cd /opt/myanmar-v2/apps/api && pip install -r requirements.txt
sudo systemctl restart myanmar-api
sudo nginx -t && sudo systemctl reload nginx
```

- Frontend(목표): `apps/web/dist/` → nginx SPA (`/` fallback)
- **현재 FO 실구현**은 `html/C안/FO` + `build.py`(§12.2) — `apps/web` 이전 전까지 운영 FO는 레거시 정적 빌드 가능
- API: systemd `myanmar-api` + uvicorn `:8000`
- SSL: certbot `--nginx` (`www`·`admin` 서브도메인)

### 12.2 FO·BO 정적 빌드 (IwinV)

| 구성요소 | 명령/URL |
| --- | --- |
| FO 빌드 | `python3 build.py` — IwinV: `TOPIK_API_BASE` 생략(동일 origin `/api`) 또는 `/api` |
| BO 빌드 | `python3 build-bo.py` — `html/C안/BO(admin)/project/` + shared 병합 → `public-bo/` |
| IwinV FO | `https://www.topik-myanmar.com` — 레거시 `public/` 또는 신규 `apps/web/dist/` (배포 시 선택) |
| IwinV BO | `https://admin.topik-myanmar.com` — `public-bo/` 정적 (handoff) |
| IwinV API | `https://www.topik-myanmar.com/api/` (nginx → FastAPI, 동일 origin 프록시) |

---

## 13. Git

| 항목 | 값 |
| --- | --- |
| Remote | `https://github.com/aiuserthree/TOPIK-MYANMAR.git` |
| 기본 브랜치 | `main` |
| 로컬 클론 경로(운영) | `/opt/myanmar-v2` |

관련 문서:

- [`MIGRATION.md`](../MIGRATION.md) — 재개발 스캐폴드·로컬 실행 요약
- [`docs/DEV_SPEC.md`](DEV_SPEC.md) — 본 문서
- [`docs/PROJECT_REVIEW.md`](PROJECT_REVIEW.md) — FO/BO handoff 기준 종합 리뷰 (2026-06-06)
- [`docs/IWINV_SETUP.md`](IWINV_SETUP.md) — IwinV VPS 운영
- [`docs/DEPLOY.md`](DEPLOY.md) — IwinV + FastAPI 배포 체크리스트

---

## 14. 미구현/다음 단계

### 14.1 저장소·배포 갭 (우선)

1. **FO 공지 본문 다국어** — API는 `body_html`(KO)만 반환; FO에서 언어별 본문 표시 미구현
2. **IwinV BO 배포** — `build-bo.py` → `public-bo/` 후 `admin.topik-myanmar.com` nginx 정적 제공 검증
3. **레거시 `api/` Fastify** — 참조용 잔존; 신규 개발은 `apps/api` 기준
4. **문서 정리** — `api/README.md`·`DEPLOY.md`의 `html/C안/BO/` 경로는 저장소와 불일치 (handoff 경로로 갱신 필요)

### 14.2 FastAPI·운영 완성 (1단계 이후)

1. IwinV Web/DB [`IWINV_SETUP.md`](IWINV_SETUP.md) — nginx, systemd, PostgreSQL, **테라웹메일 SMTP** DNS(MX/SPF/DKIM)
2. Google OAuth (`/auth/google`) — 고객사 앱 등록 확정 후
3. ~~이메일 14종 ko/my/en 렌더·도메인 트리거~~ — 완료 (`email_render.py` + `email_templates.py` + `email_templates_i18n.py`)
4. `STORAGE_PROVIDER=s3` + IwinV 오브젝트 스토리지 (운영 사진)
5. `html/C안/FO` → `apps/web` 페이지 이전 (중기)
6. 응시료·수납처 — 고객사 최종 문구 확정 후 `rules-fee.html` 등 정적 HTML 갱신 (API 연동 불필요, §15)

### 14.3 운영 전환

- DNS `www.topik-myanmar.com`, `admin.topik-myanmar.com` → IwinV Web VPS
- `CORS_ORIGINS`, `PUBLIC_FO_BASE`, Google OAuth origins, `VITE_API_URL=/api` 일괄 갱신
- 운영 DB: dev 시드 금지, 첫 BO 관리자 시드/스크립트로 생성
- SMTP 스모크: `python3 scripts/test_smtp.py --to <메일>`

---

## 15. 1단계 확정 정책 (2026-06-07)

| 항목 | 결정 | 구현 |
| --- | --- | --- |
| 1차 회차 | **제107회** (접수 7/17~21, 시험 10/18) | `scripts/seed_dev.py` |
| 시험장 | BO에서 등록 — seed에 시험장 **미포함** | 빈 `exam_venues` OK |
| 응시료·수납처 FO | **정적 HTML 문구** (`rules-fee.html`, `apply-howto.html`) — API/DB 연동 **없음** | 임시 50,000/75,000 MMK·수납기간 하드코딩 |
| 응시료 seed | 임시 `fee_level_i/ii` (107회 회차 메타) | BO·`register.html` 금액 표시용 |
| 일정 API | `index.html`·`guide-overview.html`만 `getExamRounds`로 수납기간 등 보조 표시 | `payment_start_at`/`payment_end_at` 계산 필드 |
| BO 마케팅 공지 | 게시 시 `marketing_opt_in` 회원 일괄 메일 | `POST /admin/notices/{id}/send-marketing` |
| 동시성 | `rev` + `If-Match` / body `rev` → 409 | `app/lib/rev.py` |

**고객사 확정 대기** — [`기능정의서/정책_합의_워크시트.md`](기능정의서/정책_합의_워크시트.md) §「개발팀 메모」참고.

---

## 16. 운영 배포 체크리스트 (IwinV · 스테이징 없음)

상세 절차·nginx 예시·SMTP·S3는 [`IWINV_SETUP.md`](IWINV_SETUP.md)를 따릅니다. 아래는 **배포 전·후 필수 확인**만 모은 목록입니다.

### 16.1 코드/저장소가 하는 일 (배포 시 git pull 후)

| 작업 | 명령/위치 |
| --- | --- |
| FO 정적 | `python3 build.py` → `public/` (`TOPIK_API_BASE` 생략 = same-origin) |
| BO 정적 | `python3 build-bo.py` → `public-bo/` (동일) |
| API | `apps/api` venv + `systemctl restart myanmar-api` |
| Vite FO (선택) | `apps/web` `npm run build` → `dist/` |
| DB 스키마 | `db/migrations/V001`~`V007` 순서 `psql -f` (V007: postgres superuser, IwinV는 stdin `<`) |
| 운영 시드 | `CONFIRM_PROD_SEED=1 python3 scripts/seed_prod.py` (**`seed_dev.py` 금지**) |
| 첫 BO 관리자 | `ADMIN_EMAIL=… ADMIN_PASSWORD=… python3 scripts/create_admin.py` |

### 16.2 IwinV 콘솔·서버에서 직접 해야 할 일

| 영역 | 작업 |
| --- | --- |
| **DNS** | `www`·`admin` A 레코드 → Web VPS `115.68.222.58` |
| **방화벽** | ELCAP + ufw: Web 80/443 공개, DB 5432는 Web IP만, SSH는 관리 IP만 |
| **PostgreSQL** | DB VPS 계정·`pg_hba.conf`·백업 cron |
| **SSL** | certbot `--nginx` (`www` + `admin`) |
| **nginx FO** | `public/` 또는 `apps/web/dist/` + `/api/` → `:8000` |
| **nginx BO** | `public-bo/` + **`/api/` 프록시 필수** (`admin.topik-myanmar.com`) |
| **S3** | 버킷 생성, Access Key 발급, Private 유지, `apps/api/.env` S3 블록 |
| **SMTP** | 테라웹메일 신청, MX/SPF/DKIM, `noreply@` 계정, `.env` SMTP 블록 |
| **비밀값** | `JWT_SECRET`·`JWT_REFRESH_SECRET` 32자+ 랜덤, `.env` chmod 600 |

### 16.3 `apps/api/.env` 운영 필수값

| 변수 | 운영 값 |
| --- | --- |
| `APP_ENV` | `production` (localhost CORS·`dev_code` 비활성) |
| `DATABASE_URL` | `postgresql+asyncpg://topik_app@115.68.227.1:5432/topik_myanmar` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 강한 랜덤 (기본값 사용 시 API 기동 거부) |
| `CORS_ORIGINS` | `https://www.topik-myanmar.com,https://admin.topik-myanmar.com` |
| `STORAGE_PROVIDER` | `s3` (+ `S3_*` 전부 — 누락 시 API 기동 실패, local 폴백 없음) |
| `MAIL_PROVIDER` | `smtp` (+ SMTP 계정; DNS 미완 시 발송 실패, 가입 UX는 `mail_delivered:false`) |
| `ENABLE_EMAIL_WORKER` | `true` |
| `PUBLIC_FO_BASE` | `https://www.topik-myanmar.com` |

### 16.4 P0 배포 차단 이슈 (이번 점검에서 코드 수정됨)

| 이슈 | 조치 |
| --- | --- |
| BO `topik-api-base` = `127.0.0.1:8000` | meta 제거, `bo-api-client` same-origin, 빌드 시 stale meta 삭제 |
| BO 서브도메인 nginx `/api/` 누락 | `IWINV_SETUP.md` §1.11 server 블록 |
| `seed_dev.py` 운영 실행 | `seed_prod.py` + `create_admin.py` 분리 |
| S3 미설정 + `STORAGE_PROVIDER=s3` | `validate_storage_settings()` 기동 시 실패 |
| 약한 JWT 운영 | `APP_ENV=production` 시 `validate_runtime_settings()` |

### 16.5 배포 후 스모크 순서

[`IWINV_SETUP.md`](IWINV_SETUP.md) §3.4 — API health → S3 업로드/조회 → FO 가입 → 접수 → BO 로그인·사진·승인 → 메일 outbox.

### 16.6 알려진 P1/P2·고객사 확정 대기

| 등급 | 항목 |
| --- | --- |
| P1 | SMTP/DNS 미확정 시 이메일 인증 불가 (FO 가입 블로cker) |
| P1 | 제107회 시험장 BO 수동 등록 필요 (seed에 미포함) |
| P1 | FO `ticket.html` — 수험표 사진 미표시(by design, topik.go.kr 안내 전용) |
| P2 | Google OAuth — API `enabled:false` 고정, 고객사 앱 등록 후 |
| P2 | FO 공지 다국어 본문 미구현 |
| P2 | 응시료·수납처 최종 MMK — 정적 HTML + seed 임시값 |

---

## 부록: 포트·URL 요약

### 로컬 개발

| 서비스 | URL / 포트 |
| --- | --- |
| Vite (신규 FO) | http://localhost:5173 |
| FastAPI (신규 API) | http://localhost:8000 |
| Fastify (레거시 API) | http://localhost:3000 |
| 레거시 FO 정적 | http://localhost:8080 (`html/C안/FO`) |
| 레거시 BO handoff | http://localhost:8081 (`html/C안/BO(admin)/project`) |
| PostgreSQL | localhost:5432 |

### Vite 프록시

| 클라이언트 요청 | 프록시 대상 |
| --- | --- |
| `http://localhost:5173/api/*` | `http://127.0.0.1:8000/*` |

### IwinV 운영 (nginx)

| 경로 | 처리 |
| --- | --- |
| `https://www.topik-myanmar.com/` | `public/` 또는 `apps/web/dist/` |
| `https://admin.topik-myanmar.com/` | `public-bo/` |
| `https://*/api/*` | FastAPI `127.0.0.1:8000` (FO·BO server 블록 **양쪽** 프록시) |
| DB | `115.68.227.1:5432` (Web 서버에서만 접근) |

### IwinV 운영 (확정 도메인)

| 서비스 | URL |
| --- | --- |
| FO | https://www.topik-myanmar.com |
| BO | https://admin.topik-myanmar.com |
| API | https://www.topik-myanmar.com/api/ (동일 origin 프록시) |
