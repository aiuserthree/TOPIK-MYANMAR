# TOPIK Myanmar FastAPI

미얀마 TOPIK FO/BO **운영 API** (`apps/api`). 레거시 `api/` Fastify 서버는 참조용이며, 신규 개발은 본 디렉터리를 기준으로 합니다.

> **기준일:** 2026-06-11

## 구성

```text
apps/api/
├── app/
│   ├── main.py              # FastAPI 앱, CORS, lifespan(email worker), 예외 핸들러
│   ├── config.py            # Settings (DB·JWT·CORS·S3·MAIL·Google OAuth)
│   ├── database.py          # SQLAlchemy async engine/session
│   ├── models/              # User, Application, Exam, Content, Board, Admin, EmailOutbox 등
│   ├── lib/                 # deps, security, storage, mail, email_worker, audit, roster_export, rev 등
│   └── routers/
│       ├── health.py        # /health, /health/db, /health/mail
│       ├── auth.py          # FO/BO 로그인, 가입, Google OAuth, 이메일 인증, 비번 재설정
│       ├── me.py            # /me, change-password, withdraw
│       ├── exam.py          # exam-rounds, exam-venues
│       ├── applications.py  # draft, submissions, applications, cancel
│       ├── content.py       # notices, faq, terms
│       ├── board.py         # FO 게시판 (환불·정정, 문의)
│       ├── files.py         # 파일 프록시 (local/S3)
│       └── admin_api.py     # BO /admin/* 전체
├── alembic/                 # bootstrap revision 1개 (빈 DB 전용, 운영은 SQL migration)
├── requirements.txt
└── .env.example
```

스키마 정본: `db/migrations/V001`~`V012` SQL. Alembic은 신규 빈 DB 부트스트랩용 보조 수단입니다.

## 로컬 실행

```bash
cd apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

확인:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/db
curl http://localhost:8000/api/v1/auth/status
```

## DB 마이그레이션

```bash
# 저장소 루트 — V001~V012 일괄 (V007 pgvector는 superuser 별도)
bash scripts/run-migrations.sh

# V007만 superuser (CREATE EXTENSION vector)
sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
```

| Migration | 내용 |
| --- | --- |
| V001 | 핵심 스키마 (users, applications, admin_users, notices, board 등) |
| V002 | email_outbox 재시도 컬럼 |
| V003 | application_memos, audit log JSON |
| V004 | last_login_at |
| V005 | application_drafts (30일 TTL) |
| V006 | 로그인 잠금, 비밀글 잠금, terms_consents, 지역 코드 |
| V007 | pgvector + semantic_chunks |
| V008 | exam_venues.name_my (미얀마어 시험장명) |
| V009 | 공지 MY/EN·노출 기간·휴지통 |
| V010 | 게시판 공식 답변 이력 |
| V011 | BO 권한 매트릭스 |
| V012 | admin_access_logs, member_access_logs |

### BO 접근 로그 API (super 전용)

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/v1/admin/access-logs/admins` | 관리자 로그인·로그아웃·세션만료·실패 이력 |
| GET | `/api/v1/admin/access-logs/members` | 회원 로그인·로그아웃·페이지접근 이력 |
| GET | `/api/v1/admin/permission-history` | 권한 매트릭스·등급 변경 이력 (`admin_audit_logs` 필터) |

V012 미적용 시 위 API는 `503 MIGRATION_REQUIRED`를 반환합니다.

## 시드

```bash
# 개발 (저장소 루트)
python3 scripts/seed_dev.py        # 제107회 + 데모 FO/BO 계정

# 운영 (dev 시드 금지)
CONFIRM_PROD_SEED=1 python3 scripts/seed_prod.py
ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 scripts/create_admin.py
```

## 환경 변수 (주요)

```env
DATABASE_URL=postgresql+asyncpg://topik_app:비밀번호@127.0.0.1:5432/topik_myanmar
JWT_SECRET=운영용-긴-랜덤-문자열-32자이상
JWT_REFRESH_SECRET=별도-긴-랜덤-문자열
CORS_ORIGINS=http://localhost:8080,http://localhost:8081,http://localhost:5173

# 스토리지 (개발: local, 운영: s3)
STORAGE_PROVIDER=local
UPLOAD_DIR=var/uploads

# 메일 (개발: console, 운영: smtp)
MAIL_PROVIDER=console
ENABLE_EMAIL_WORKER=false

# Google OAuth (선택 — GOOGLE_CLIENT_ID 설정 시 활성)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

PUBLIC_FO_BASE=https://www.topik-myanmar.com
```

전체 목록: `.env.example` · [`docs/DEV_SPEC.md`](../../docs/DEV_SPEC.md) §8

## 구현된 API (요약)

| 영역 | Prefix | 상태 |
| --- | --- | --- |
| Health | `/health`, `/health/db`, `/health/mail` | 구현 |
| Auth | `/api/v1/auth/*` (login, register, Google, verify, reset) | 구현 |
| Me | `/api/v1/me/*` | 구현 |
| Exam | `/api/v1/exam-rounds`, `/exam-venues` | 구현 |
| Applications | `/api/v1/application-draft`, `application-submissions`, `applications` | 구현 |
| Content | `/api/v1/notices`, `/faq`, `/terms` | 구현 |
| Board | `/api/v1/board/*` | 구현 |
| Files | `/api/v1/files/:id`, `/admin/files/:id` | 구현 |
| Admin | `/api/v1/admin/*` (접수·회차·콘텐츠·게시판·회원·관리자·감사·export) | 구현 |

상세: [`docs/system_design/tech-spec.md`](../../docs/system_design/tech-spec.md) §4

## 관련 문서

- [`docs/DEV_SPEC.md`](../../docs/DEV_SPEC.md) — 전체 개발 스펙
- [`docs/DEPLOY.md`](../../docs/DEPLOY.md) — 배포 체크리스트
- [`docs/IWINV_SETUP.md`](../../docs/IWINV_SETUP.md) — IwinV 운영
