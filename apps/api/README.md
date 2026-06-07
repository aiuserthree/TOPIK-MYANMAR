# TOPIK Myanmar FastAPI

Vite + React + FastAPI 재개발을 위한 초기 API 스캐폴드입니다. 기존 `api/` Fastify 서버와 `db/migrations/*.sql`은 그대로 두고, 새 백엔드는 `apps/api`에서 별도로 시작합니다.

## 구성

```text
apps/api/
├── app/
│   ├── main.py              # FastAPI 앱, CORS, 라우터 등록
│   ├── config.py            # DATABASE_URL, JWT_SECRET, CORS_ORIGINS
│   ├── database.py          # SQLAlchemy async engine/session
│   └── routers/
│       ├── health.py        # GET /health
│       └── auth.py          # GET /api/v1/auth/status placeholder
├── alembic/                 # 향후 ORM 기반 migration 작성 위치
├── alembic.ini
├── pyproject.toml
└── .env.example
```

기존 스키마는 `db/migrations`의 SQL을 기준으로 합니다. 현재 주요 테이블은 `users`, `exam_rounds`, `exam_venues`, `applications`, `admin_users`, `application_memos`, `email_outbox`, `application_drafts` 등입니다.

## 로컬 실행

Python 가상환경과 PostgreSQL 접속 정보만 사용합니다.

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
curl http://localhost:8000/api/v1/auth/status
```

## 환경 변수

```env
DATABASE_URL=postgresql+asyncpg://topik_app:비밀번호@127.0.0.1:5432/topik_myanmar
JWT_SECRET=운영용-긴-랜덤-문자열
CORS_ORIGINS=http://localhost:5173
```

FastAPI/SQLAlchemy async 연결은 `postgresql+asyncpg://` 형식을 사용합니다. 일반 `psql` 또는 다른 도구에서는 `postgresql://` 형식을 사용해도 됩니다.

## PostgreSQL 연결

로컬 DB를 쓸 경우:

```bash
createdb topik_myanmar
psql postgresql://localhost:5432/topik_myanmar -f ../../db/migrations/V001__initial_schema.sql
psql postgresql://localhost:5432/topik_myanmar -f ../../db/migrations/V002__email_outbox_retry.sql
psql postgresql://localhost:5432/topik_myanmar -f ../../db/migrations/V003__bo_integration.sql
psql postgresql://localhost:5432/topik_myanmar -f ../../db/migrations/V004__user_last_login.sql
psql postgresql://localhost:5432/topik_myanmar -f ../../db/migrations/V005__application_drafts.sql
psql postgresql://localhost:5432/topik_myanmar -f ../../db/migrations/V006__fo_contract_and_security.sql
sudo -u postgres psql -d topik_myanmar < ../../db/migrations/V007__pgvector_semantic_search.sql
```

Iwinv VPS의 PostgreSQL에 직접 연결할 경우 `DATABASE_URL`의 host를 VPS 내부 IP 또는 허용된 공인 IP로 바꿉니다.

## Alembic

현재 운영 기준 적용 절차는 `db/migrations/V001`부터 `V007`까지의 SQL migration입니다. Alembic의 단일 초기 revision은 신규 빈 DB에 ORM 기준 스키마를 만들기 위한 보조 수단이며, 운영 DB 변경 이력의 기준으로 혼용하지 않습니다.

```bash
cd apps/api
alembic revision -m "create example table"
alembic upgrade head
```
