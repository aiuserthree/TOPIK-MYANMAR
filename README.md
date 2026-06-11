# TOPIK Myanmar

미얀마 TOPIK 시험 **온라인 접수·운영** 웹 서비스 (FO: 응시자 / BO: 운영 관리자).

> **기준일:** 2026-06-11 · 1차 목표 회차: **제107회** (접수 2026-07-17~21, 시험 2026-10-18)

## 현재 구현 상태

| 구분 | 경로 | 상태 |
| --- | --- | --- |
| **운영 FO** | `html/C안/FO/` (25페이지, HTML/CSS/JS) | FastAPI 연동 완료 → `build.py` → `public/` |
| **운영 BO** | `html/C안/BO(admin)/project/` (React 18 CDN SPA) | 패널 16개 FastAPI 연동 → `build-bo.py` → `public-bo/` |
| **운영 API** | `apps/api/` (FastAPI) | FO/BO REST API 구현 완료 |
| **DB** | `db/migrations/V001`~`V012` | PostgreSQL 15 + pgvector |
| **신규 FO (중기)** | `apps/web/` (Vite + React) | 홈 placeholder만 존재, 미운영 |
| **레거시 API** | `api/` (Fastify) | 참조용 잔존 |

## 빠른 시작 (로컬)

```bash
# 1. DB 마이그레이션 (V001~V012)
bash scripts/run-migrations.sh
# V007(pgvector)만 superuser 필요: sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql

# 2. API
cd apps/api && python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 3. 시드 (다른 터미널, 저장소 루트)
python3 scripts/seed_dev.py

# 4. FO/BO 정적 서버
cd html/C안/FO && python3 -m http.server 8080          # http://localhost:8080
cd html/C안/BO\(admin\)/project && python3 -m http.server 8081  # BO
```

| 서비스 | URL | 데모 계정 (seed 후) |
| --- | --- | --- |
| FO | http://localhost:8080 | `demo@topik-mm.local` / `DemoUser!2026` |
| BO | http://localhost:8081/admin-login.html | `admin-dev@topik-mm.local` / `DevOnly!2026` |
| API | http://localhost:8000/health | — |

## 프로젝트 구조

```text
Myanmar_v2.0/
├── apps/api/              # FastAPI 백엔드 (정본)
├── apps/web/              # Vite+React 스캐폴드 (미운영)
├── html/C안/FO/           # 운영 FO (HTML/CSS/JS)
├── html/C안/BO(admin)/project/  # 운영 BO SPA
├── html/shared/           # api-client.js, bo-api-client.js, roster-codes.js
├── db/migrations/         # V001~V012 SQL
├── scripts/               # seed, deploy, migrate, test
├── build.py / build-bo.py # 정적 빌드
└── docs/                  # 설계·운영 문서
```

## 문서 인덱스

| 문서 | 내용 |
| --- | --- |
| [`docs/DEV_SPEC.md`](docs/DEV_SPEC.md) | 개발 스펙·환경 변수·API 현황 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | IwinV 배포 체크리스트 |
| [`docs/IWINV_SETUP.md`](docs/IWINV_SETUP.md) | IwinV VPS 상세 절차 |
| [`docs/system_design/overview.md`](docs/system_design/overview.md) | 시스템 설계 개요 |
| [`docs/PROJECT_REVIEW.md`](docs/PROJECT_REVIEW.md) | FO/BO 구현 리뷰 |
| [`apps/api/README.md`](apps/api/README.md) | FastAPI 로컬 실행 |
| [`docs/기능정의서/README.md`](docs/기능정의서/README.md) | 기능정의서 인덱스 |
| [`docs/사용가이드/FO_사용가이드.md`](docs/사용가이드/FO_사용가이드.md) | 응시자 화면 사용 가이드 |
| [`docs/사용가이드/BO_사용가이드.md`](docs/사용가이드/BO_사용가이드.md) | 관리자 화면 사용 가이드 |
| [`docs/통합테스트/통합테스트_시나리오.md`](docs/통합테스트/통합테스트_시나리오.md) | 통합 테스트 시나리오 (244건) |

## 운영 인프라 (IwinV)

| 서버 | IP | 역할 |
| --- | --- | --- |
| Web | `115.68.222.58` | nginx + FastAPI + FO/BO 정적 |
| DB | `115.68.227.1` | PostgreSQL 15 + pgvector |

| 도메인 | 용도 |
| --- | --- |
| `https://www.topik-myanmar.com` | FO + `/api/` |
| `https://admin.topik-myanmar.com` | BO + `/api/` |

## 미구현·후속

- 의미 검색/RAG (`semantic_chunks` 스키마만, `SEMANTIC_SEARCH_ENABLED=false`)
- FO 공지 본문 다국어 (API `body_html` KO 단일)
- `apps/web` FO 화면 이전 (중기)
- 운영 SMTP/DNS 확정 후 실발송 검증
