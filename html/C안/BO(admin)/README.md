# TOPIK Myanmar BO (운영 관리자)

미얀마 TOPIK **백오피스(BO)** 운영 화면. React 18 CDN + Babel SPA로 구현되어 있으며, FastAPI `apps/api`의 `/api/v1/admin/*`와 연동합니다.

> **기준일:** 2026-06-11

## 구성

| 경로 | 역할 |
| --- | --- |
| `project/admin-login.html` | 관리자 로그인 |
| `project/admin.html` | SPA 셸 (사이드바 라우팅) |
| `project/assets/app.jsx` | 패널 라우터, 최초 비밀번호 변경 게이트 |
| `project/assets/bo-api-bridge.js` | 패널 액션 → `TopikBoApi` 매핑 |
| `project/panels/*.jsx` | 기능 패널 16개 |
| `project/shared/bo-api-client.js` | Admin API 클라이언트 |

## 패널 목록

`dashboard`, `applicants`, `sessions`, `venues`, `notices`, `faq`, `refunds`, `inquiries`, `members`, `terms`, `admins`, `permissions`, `audit`

## 로컬 실행

```bash
# API 먼저 기동 (저장소 루트)
cd apps/api && source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# BO 정적 서버
cd html/C안/BO\(admin\)/project
python3 -m http.server 8081
# http://localhost:8081/admin-login.html
```

데모 계정 (`python3 scripts/seed_dev.py` 후): `admin-dev@topik-mm.local` / `DevOnly!2026`

## 빌드·배포

```bash
python3 build-bo.py   # → public-bo/
# IwinV: TOPIK_API_BASE 생략 → nginx same-origin /api
```

운영 URL: `https://admin.topik-myanmar.com`

## 문서

- [`docs/PROJECT_REVIEW.md`](../../../docs/PROJECT_REVIEW.md) — BO 구현 리뷰
- [`docs/system_design/services/bo-*.md`](../../../docs/system_design/services/) — BO 서비스별 설계
