# TOPIK Myanmar 재개발 스캐폴드

> 전체 개발 스펙: [`docs/DEV_SPEC.md`](docs/DEV_SPEC.md) · FO/BO handoff 리뷰: [`docs/PROJECT_REVIEW.md`](docs/PROJECT_REVIEW.md)

## 확정 스택

- Frontend: Vite + React + TypeScript (`apps/web`)
- Backend: Python FastAPI 3.11+ (`apps/api`)
- Database: PostgreSQL 15+ on Iwinv VPS **+ pgvector** (FAQ/공지 의미 검색·RAG·중복 탐지)
- Object Storage: IwinV S3 호환 오브젝트 스토리지 (회원 사진·파일 업로드, `docs/IWINV_SETUP.md` §5)
- 운영 원칙: 신규 스택에는 Docker를 사용하지 않고, 기존 `api/`, `html/`, `build.py`, `build-bo.py`는 보존합니다.
- BO 화면 디자인 handoff: `html/C안/BO(admin)/project/` (운영 API stub은 `html/C안/BO/`)

## 폴더 구조

```text
apps/
├── web/                    # Vite + React 신규 프론트엔드
└── api/                    # FastAPI 신규 백엔드
db/
└── migrations/             # 기존 PostgreSQL SQL migrations 유지
packages/
└── shared/                 # 공통 상수/타입 placeholder
```

## 로컬 실행

API:

```bash
cd apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Web:

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

브라우저:

- Web: http://localhost:5173
- API health: http://localhost:8000/health

Vite dev server는 `/api`를 FastAPI(`127.0.0.1:8000`)로 프록시합니다.

## 기존 DB migration 적용

기존 SQL migration은 `db/migrations`에 유지합니다. 새 FastAPI 앱은 `DATABASE_URL`로 같은 PostgreSQL에 연결합니다.

```bash
psql "$DATABASE_URL" -f db/migrations/V001__initial_schema.sql
psql "$DATABASE_URL" -f db/migrations/V002__email_outbox_retry.sql
psql "$DATABASE_URL" -f db/migrations/V003__bo_integration.sql
psql "$DATABASE_URL" -f db/migrations/V004__user_last_login.sql
psql "$DATABASE_URL" -f db/migrations/V005__application_drafts.sql
psql "$DATABASE_URL" -f db/migrations/V006__fo_contract_and_security.sql
# V007 — postgres superuser (CREATE EXTENSION vector). IwinV: docs/IWINV_SETUP.md §2.4.1
# stdin: 현재 셸이 파일을 읽고 postgres 가 SQL 실행 (-f 는 postgres 가 경로를 열어 /root 등에서 실패)
sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
```

로컬 Docker (선택):

```bash
docker compose -f docker-compose.pgvector.yml up -d
# V001~V007 순서 적용 — DATABASE_URL=postgresql://topik_app:topik_dev@127.0.0.1:5432/topik_myanmar
```

## Iwinv VPS PostgreSQL 기본 설정

Ubuntu VPS 예시:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-15-pgvector
sudo -u postgres psql
```

DB/user 생성:

```sql
CREATE DATABASE topik_myanmar;
CREATE USER topik_app WITH ENCRYPTED PASSWORD '강한_비밀번호';
GRANT ALL PRIVILEGES ON DATABASE topik_myanmar TO topik_app;
```

원격 접속이 필요하면 `/etc/postgresql/*/main/postgresql.conf`의 `listen_addresses`와 `pg_hba.conf`를 조정한 뒤 PostgreSQL을 재시작합니다. 방화벽은 앱 서버 IP만 허용합니다.

```bash
sudo ufw allow from <APP_SERVER_IP> to any port 5432 proto tcp
sudo systemctl restart postgresql
```

FastAPI 연결 문자열:

```env
DATABASE_URL=postgresql+asyncpg://topik_app:강한_비밀번호@<DB_HOST>:5432/topik_myanmar
```

백업 기본:

```bash
pg_dump -Fc -U topik_app -h <DB_HOST> topik_myanmar > topik_myanmar_$(date +%Y%m%d).dump
pg_restore -d topik_myanmar_restore topik_myanmar_YYYYMMDD.dump
```

## 다음 단계

1. Iwinv Web/DB 서버 생성 후 [`docs/IWINV_SETUP.md`](docs/IWINV_SETUP.md)에 따라 운영 환경을 설정합니다.
2. 기존 `html/C안/FO` 화면을 페이지 단위로 `apps/web`에 옮길 우선순위를 정합니다. BO UI 참조는 `html/C안/BO(admin)/project/`를 사용합니다.
3. 기존 Fastify `api/src/routes`를 기준으로 FastAPI router 계약을 설계합니다.
4. 기존 SQL schema에 맞춘 SQLAlchemy model 또는 repository 레이어 작성 방식을 결정합니다.
5. Iwinv VPS PostgreSQL 접속 정책, 백업 주기, 운영 계정을 확정합니다.
