# TOPIK Myanmar — 재개발·이전 요약

> **기준일:** 2026-06-11  
> 전체 스펙: [`docs/DEV_SPEC.md`](docs/DEV_SPEC.md) · FO/BO 리뷰: [`docs/PROJECT_REVIEW.md`](docs/PROJECT_REVIEW.md)

## 현재 상태 (2026-06-11)

**1단계 구현 완료.** 운영 화면은 `html/C안/` 정적 HTML, API는 `apps/api` FastAPI가 정본입니다.

| 영역 | 정본 경로 | 상태 |
| --- | --- | --- |
| FO 화면 | `html/C안/FO/` (25페이지) | FastAPI 연동, `build.py` → `public/` |
| BO 화면 | `html/C안/BO(admin)/project/` | 패널 16개 FastAPI 연동, `build-bo.py` → `public-bo/` |
| API | `apps/api/` | FO/BO REST 전반 구현 |
| DB | `db/migrations/V001`~`V012` | PostgreSQL 15 + pgvector |
| 신규 FO | `apps/web/` (Vite+React) | 스캐폴드만 — **미운영** |
| 레거시 API | `api/` (Fastify) | 참조용 |

## 확정 스택

| 계층 | 기술 |
| --- | --- |
| **운영 FO** | HTML + CSS + JavaScript (`html/C안/FO`) |
| **운영 BO** | React 18 CDN + Babel SPA (`html/C안/BO(admin)/project/`) |
| **Backend** | Python 3.11+ · FastAPI · SQLAlchemy(async) · asyncpg |
| **Database** | PostgreSQL 15+ **+ pgvector** (IwinV DB VPS) |
| **Object Storage** | IwinV S3 (`https://kr.object.iwinv.kr`) |
| **운영** | IwinV VPS 2대 · nginx + systemd |

`apps/web`(Vite+React)는 중기 FO 이전 목표이며, 현재 운영 FO는 레거시 정적 빌드를 사용합니다.

## 폴더 구조

```text
apps/
├── api/                    # FastAPI 운영 API (정본)
└── web/                    # Vite+React 스캐폴드 (미운영)
html/
├── C안/FO/                 # 운영 FO
├── C안/BO(admin)/project/  # 운영 BO
└── shared/                 # 공통 JS 클라이언트
db/migrations/              # V001~V012 SQL
packages/shared/            # 공통 상수 placeholder
build.py / build-bo.py      # 정적 빌드
```

## 로컬 실행

**API:**

```bash
cd apps/api
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**FO/BO (권장 — 실제 운영 화면):**

```bash
python3 scripts/seed_dev.py   # 저장소 루트
cd html/C안/FO && python3 -m http.server 8080
cd html/C안/BO\(admin\)/project && python3 -m http.server 8081
```

**Vite 스캐폴드 (선택):**

```bash
cd apps/web && npm install && npm run dev   # http://localhost:5173
```

## DB migration 적용

```bash
# V001~V012 일괄 (V007 pgvector는 superuser 별도)
bash scripts/run-migrations.sh

# V007 — postgres superuser
sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
```

FastAPI는 `DATABASE_URL=postgresql+asyncpg://...` 형식을 사용합니다.

## IwinV VPS PostgreSQL

상세: [`docs/IWINV_SETUP.md`](docs/IWINV_SETUP.md)

```bash
sudo apt install -y postgresql postgresql-contrib postgresql-15-pgvector
```

```sql
CREATE DATABASE topik_myanmar;
CREATE USER topik_app WITH ENCRYPTED PASSWORD '강한_비밀번호';
GRANT ALL PRIVILEGES ON DATABASE topik_myanmar TO topik_app;
```

## 다음 단계 (2단계 이후)

1. IwinV 운영 배포 — [`docs/DEPLOY.md`](docs/DEPLOY.md), DNS·SMTP·S3 확정
2. Google OAuth 운영 앱 등록 (`GOOGLE_CLIENT_ID` 설정)
3. FO 공지 본문 다국어
4. 의미 검색/RAG API (`SEMANTIC_SEARCH_ENABLED`)
5. `html/C안/FO` → `apps/web` 페이지 이전 (중기)
