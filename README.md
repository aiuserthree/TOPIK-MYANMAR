# TOPIK Myanmar

미얀마 TOPIK 시험 **온라인 접수·운영** 웹 서비스 (FO: 응시자 / BO: 운영 관리자).

> **기준일:** 2026-08-13 · 운영 중 — `www.topik-myanmar.com` (최신 커밋 기준 **제109회** 접수 진행)

## 현재 구현 상태

| 구분 | 경로 | 상태 |
| --- | --- | --- |
| **운영 FO** | `html/C안/FO/` (25페이지, HTML/CSS/JS) | FastAPI 연동 완료 → `build.py` → `public/` |
| **운영 BO** | `html/C안/BO(admin)/project/` (React 18 CDN SPA) | 패널 17개 FastAPI 연동 → `build-bo.py` → `public-bo/` |
| **운영 API** | `apps/api/` (FastAPI) | FO/BO REST API 구현 완료 (라우터 9개) |
| **DB** | `db/migrations/V001`~`V022` | PostgreSQL 15 + pgvector |
| **신규 FO (중기)** | `apps/web/` (Vite + React) | 홈 placeholder만 존재, 미운영 |
| **레거시 API** | `api/` (Fastify) | 참조용 잔존 |

FO/BO는 한국어·미얀마어·영어 3개 국어를 제공합니다 (FO 문구: `html/C안/FO/shared/topik-i18n-content.js`, 공지·FAQ 본문: DB `*_my` / `*_en` 컬럼).

## 빠른 시작 (로컬)

```bash
# 1. DB 마이그레이션 (V001~V022)
#    V007은 CREATE EXTENSION(pgvector)이라 superuser가 먼저 1회 실행해야 한다.
#    (run-migrations.sh는 ON_ERROR_STOP=1이라 V007에서 막히면 V008 이후가 적용되지 않는다)
sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
bash scripts/run-migrations.sh    # db/migrations/V*.sql 전체 + db/seed/prod_seed.sql

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
TOPIK-MYANMAR/
├── apps/api/              # FastAPI 백엔드 (정본) — routers: auth, me, applications,
│                          #   exam, content, board, admin_api, files, health
├── apps/web/              # Vite+React 스캐폴드 (미운영)
├── html/C안/FO/           # 운영 FO (HTML/CSS/JS) — shared/에 i18n 문구·api-client
├── html/C안/BO(admin)/project/  # 운영 BO SPA — panels/ 17개
├── html/shared/           # api-client.js, bo-api-client.js, form-validation.js, roster-codes.js
├── db/migrations/         # V001~V022 SQL
├── db/seed/               # dev_seed.sql, prod_seed.sql
├── scripts/               # seed, deploy, migrate, test
├── build.py / build-bo.py # 정적 빌드 (public/, public-bo/ — git 비추적)
├── 시안/                  # 디자인 시안 + 이메일 템플릿 원본 (실제 렌더는 apps/api/app/lib/email_*, 13종 ko/my/en)
└── docs/                  # 설계·운영 문서
```

`build.py`는 `html/shared/` → `html/C안/FO/shared/` 순으로 병합하므로 파일명이 겹치면 **FO 쪽이 우선**합니다.

## 배포

```bash
# Web VPS에서 origin/main → 운영 전체 반영 (API + BO + FO + migration)
bash scripts/deploy-all-from-git.sh
```

체크리스트는 [`docs/DEPLOY.md`](docs/DEPLOY.md), VPS 상세 절차는 [`docs/IWINV_SETUP.md`](docs/IWINV_SETUP.md)를 따릅니다.

## 스키마 이력 (V013~V022)

V001~V012는 [`docs/DEV_SPEC.md`](docs/DEV_SPEC.md) 참고. 이후 운영 중 추가된 마이그레이션:

| 버전 | 내용 |
| --- | --- |
| `V013` | OTP 인증코드 연속 실패 잠금 (회원가입·비밀번호 재설정) |
| `V014` | 서비스 이용약관 제10조(면책) 문구 정정 |
| `V015` | 게시판 신규글 메일 알림 관리자별 수신 설정 |
| `V016` | 회차 응시료 오프라인 납부 기간 |
| `V017` | 접수자 soft-delete (휴지통 30일 보관) |
| `V018` | 접수자 삭제 권한을 일반관리자 역할 매트릭스에 추가 |
| `V019` | 폐지 상태로 `round_no`를 점유하던 회차 정리 |
| `V020` | 정보(성명 등) 심사 상태 — 사진 심사와 독립 트랙 |
| `V021` | TOPIK Ⅰ/Ⅱ 급수별 정원 (통합 정원은 인원 총상한으로 유지) |
| `V022` | 수험번호 노출 정책 반전 — 공개일 미설정 = 비공개 |

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

메일은 IwinV 테라웹메일 SMTP + `email_outbox` 워커로 발송합니다 (`MAIL_PROVIDER=smtp`, 로컬은 `console`).

## 미구현·후속

- 의미 검색/RAG (`semantic_chunks` 스키마만, `SEMANTIC_SEARCH_ENABLED=false` 기본)
- `apps/web` FO 화면 이전 (중기) — 현재 홈 placeholder만 존재
- 레거시 Fastify `api/` 정리 — 참조용으로만 잔존
- `docs/DEV_SPEC.md` 기준일·스키마 범위(V012)가 현재 상태보다 뒤처져 있음
