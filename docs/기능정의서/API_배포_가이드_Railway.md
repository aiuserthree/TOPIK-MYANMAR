# API Railway 배포 가이드 (TOPIK Myanmar)

**작성일:** 2026-06-03  
**상태:** 스캐폴딩 완료 — **수동 Railway 배포** (토큰·시크릿은 repo에 저장하지 않음)  
**관련:** `api/.env.production.example`, `백엔드_스택_결정.md` — **부록(과거 임시 UAT)**. 현재 운영은 [`IWINV_SETUP.md`](../IWINV_SETUP.md).

---

## 1. 개요

| 항목 | 값 (임시) |
|------|-----------|
| FO (Vercel) | `https://topik-myanmar.vercel.app` |
| API (Railway) | `https://topikmyanmar-production.up.railway.app` |
| DB | Railway PostgreSQL addon |
| 로컬 DB | 로컬 PostgreSQL 15 또는 IwinV DB VPS 원격 연결 |

컨테이너 시작 시 `node scripts/migrate.js` → Flyway SQL + `dev_seed.sql` 적용 후 API 기동.

---

## 2. Railway 배포 5단계

### ① Railway 프로젝트 생성

1. [Railway](https://railway.app) 로그인
2. **New Project** → **Deploy from GitHub repo** → 본 저장소 선택
3. 서비스 **Settings → Root Directory** 는 **비워 둠** (repo root 기준)

### ② PostgreSQL 추가

1. 프로젝트에서 **+ New** → **Database** → **PostgreSQL**
2. API 서비스 **Variables**에 `DATABASE_URL` 참조 추가  
   - `${{Postgres.DATABASE_URL}}` 형태로 연결 (Railway UI의 **Reference** 사용)

### ③ 환경 변수 설정

`api/.env.production.example` 를 참고해 API 서비스 Variables에 설정:

| Variable | 예시 |
|----------|------|
| `APP_ENV` | `production` |
| `DATABASE_URL` | Postgres reference |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | 별도 생성 |
| `CORS_ORIGINS` | `https://topik-myanmar.vercel.app` |

### ④ 배포·헬스 확인

1. **Deploy** 트리거 (push to main 또는 Manual Deploy)
2. 배포 URL 확인: `https://<name>.up.railway.app/health` → `{ "status": "ok" }`
3. (선택) **Settings → Networking → Generate Domain** 으로 공개 URL 고정

### ⑤ FO meta 태그 연결

Railway URL 확정 후 FO HTML의 API meta를 갱신:

```html
<meta name="topik-api-base" content="https://topikmyanmar-production.up.railway.app">
```

- **권장:** `build.py` 의 `API_META` 상수를 Railway URL로 변경 → `python3 build.py` → Vercel 재배포  
- **또는** Vercel 배포 후 브라우저 콘솔에서 `window.TOPIK_API_BASE = 'https://...'` 로 임시 테스트

`html/shared/api-client.js` 우선순위: `TOPIK_API_BASE` → `API_BASE_URL` → `<meta name="topik-api-base">` → localhost.

---

## 3. 로컬 개발

로컬 PostgreSQL을 준비한 뒤:

```bash
cd api && cp .env.example .env && npm install && npm run migrate && npm run dev
```

FO는 Live Server 등으로 `html/C안/FO` 미리보기 — API는 `http://localhost:3000`. 상세는 [`api/로컬실행_가이드.md`](../../api/로컬실행_가이드.md).

---

## 4. Phase 2b (다음 개발)

아래 API는 **미구현** — 우선순위 B:

| API | 설명 |
|-----|------|
| `GET /api/v1/application-submissions/:id` | 접수 상세 조회 |
| `POST /api/v1/applications/:id/cancel` | 접수 취소 stub |

FO 연동 전 Railway prod 배포·meta 연결이 우선 (Priority A).

---

## 6. 트러블슈팅

| 증상 | 조치 |
|------|------|
| migrate 실패 | Postgres `DATABASE_URL`·네트워크 확인; Railway 로그에서 `psql` 오류 확인 |
| CORS 오류 | `CORS_ORIGINS`에 Vercel FO origin 정확히 포함 (trailing slash 없음) |
| FO가 demo 로그인만 동작 | meta `content` 비어 있음 → Railway URL 설정 후 재배포 |

---

**다음 단계:** Railway URL 확정 → `build.py` `API_META` 갱신 → `vercel --prod` → 로그인·접수 API E2E.
