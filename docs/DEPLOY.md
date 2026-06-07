# TOPIK Myanmar — 배포 체크리스트 (IwinV + FastAPI)

> **운영 목표:** IwinV VPS 2대(Web + DB) · nginx + systemd · FastAPI(`apps/api`) · PostgreSQL 15+ pgvector · IwinV 테라웹메일 SMTP · IwinV S3  
> 상세 절차: [`IWINV_SETUP.md`](IWINV_SETUP.md) · 개발 스펙: [`DEV_SPEC.md`](DEV_SPEC.md) · DNS IT 요청: [`고객사_DNS_요청_템플릿.md`](고객사_DNS_요청_템플릿.md)

---

## 1. 인프라 준비

| # | 항목 | 확인 |
|---|------|------|
| 1 | Web VPS (`115.68.222.58`) — nginx, certbot, Python 3.11+, git | ☐ |
| 2 | DB VPS (`115.68.227.1`) — PostgreSQL 15 + pgvector, 방화벽(Web IP만 5432) | ☐ |
| 3 | IwinV S3 버킷 — Private, Access Key 발급 | ☐ |
| 4 | 테라웹메일 — `noreply@topik-myanmar.com`, MX/SPF/DKIM | ☐ |
| 5 | 도메인 — `www.topik-myanmar.com`, `admin.topik-myanmar.com` | ☐ |

저장소 클론 경로(운영): `/opt/myanmar-v2`

---

## 2. DB (PostgreSQL)

DB VPS에서 `V001` → `V007` 순서로 migration 적용. V007(`CREATE EXTENSION vector`)는 **postgres superuser** + stdin 리다이렉트.

```bash
# V001~V006 — topik_app
psql "$DATABASE_URL" -f db/migrations/V001__initial_schema.sql
# ... V002 ~ V006 ...

# V007 — superuser (IWINV_SETUP.md §2.8)
sudo -u postgres psql -d topik_myanmar < /opt/myanmar-v2/db/migrations/V007__pgvector_semantic_search.sql
```

| # | 확인 |
|---|------|
| 1 | `GET /health/db` → `"pgvector": true` (API 기동 후) | ☐ |
| 2 | `topik_app` 계정으로 API 연결 테스트 | ☐ |

**운영 시드·관리자 (dev 시드 금지):**

```bash
cd /opt/myanmar-v2
CONFIRM_PROD_SEED=1 python3 scripts/seed_prod.py
ADMIN_EMAIL=<운영자메일> ADMIN_PASSWORD='<강한비밀번호>' python3 scripts/create_admin.py
```

---

## 3. API (FastAPI)

Web VPS `apps/api/.env` — [`apps/api/.env.example`](../apps/api/.env.example) 및 [`IWINV_SETUP.md`](IWINV_SETUP.md) §4·§5·§6 참고.

| Variable | 용도 |
|----------|------|
| `DATABASE_URL` | `postgresql+asyncpg://topik_app:…@115.68.227.1:5432/topik_myanmar` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (각각 별도) |
| `CORS_ORIGINS` | `https://www.topik-myanmar.com,https://admin.topik-myanmar.com` |
| `PUBLIC_FO_BASE` | `https://www.topik-myanmar.com` |
| `PUBLIC_BO_BASE` | `https://admin.topik-myanmar.com` |
| `STORAGE_PROVIDER` | `s3` (운영 필수) |
| `S3_*` | IwinV 오브젝트 스토리지 (`kr.object.iwinv.kr`) |
| `MAIL_PROVIDER` | `smtp` (운영) |
| `SMTP_*` | 테라웹메일 SMTP |
| `MAIL_FROM` | `TOPIK Myanmar <noreply@topik-myanmar.com>` |
| `ENABLE_EMAIL_WORKER` | `true` (운영) |
| `GOOGLE_CLIENT_ID` | GIS (확정 후) |

```bash
cd /opt/myanmar-v2/apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl enable --now myanmar-api   # IWINV_SETUP.md §4 unit 파일 적용 후
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/health/db
```

---

## 4. FO·BO 정적 빌드 (nginx)

```bash
cd /opt/myanmar-v2
# IwinV: TOPIK_API_BASE 생략 → nginx 동일 origin /api
python3 build.py
python3 build-bo.py
```

| 서비스 | nginx root | URL |
|--------|------------|-----|
| FO | `public/` (단기) 또는 `apps/web/dist/` (중기) | `https://www.topik-myanmar.com` |
| BO | `public-bo/` | `https://admin.topik-myanmar.com` |
| API | `proxy_pass` → `127.0.0.1:8000` | `https://www.topik-myanmar.com/api/` |

로컬 API 테스트 시:

```bash
TOPIK_API_BASE=http://127.0.0.1:8000 python3 build.py
TOPIK_API_BASE=http://127.0.0.1:8000 python3 build-bo.py
```

---

## 5. Google OAuth (Sign-In)

1. Google Cloud Console → OAuth client ID (Web application)
2. **Authorized JavaScript origins:** `https://www.topik-myanmar.com`, (필요 시) `https://admin.topik-myanmar.com`, 로컬 `http://localhost:8080`
3. `apps/api/.env`에 `GOOGLE_CLIENT_ID` 설정 후 API 재시작
4. FO 회원가입/로그인 Google 버튼 스모크

---

## 6. 운영 스모크 테스트

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | `GET https://www.topik-myanmar.com/api/health` | `{ "status": "ok" }` |
| 2 | `GET …/health/db` | `"database": "connected"`, `"pgvector": true` |
| 3 | FO 홈 로드 | 정적·API meta·favicon 정상 |
| 4 | 회원가입 — 인증코드 발송 | 메일 수신 (`email_outbox` → `sent`) |
| 5 | 회원가입 완료 → 로그인 | JWT·마이페이지 |
| 6 | 비밀번호 재설정 | 메일 + 코드로 변경 |
| 7 | 공지·FAQ 목록 | FO `GET /api/v1/notices`, `/api/v1/faq` |
| 8 | BO 로그인 → 접수·회차·공지 CRUD | `admin.topik-myanmar.com` |

**BO go-live 노트:**
- 화면 handoff: `html/C안/BO(admin)/project/` — `admin-login.html` + `admin.html`
- API 연동: `bo-api-bridge.js` → FastAPI `/api/v1/admin/*`
- 사진 영구 저장: `STORAGE_PROVIDER=s3` 필수
- 회차·시험장·공지·FAQ·약관은 BO 화면에서 CRUD (DB 직접 접근 불필요)

실패 시: `journalctl -u myanmar-api`, `email_outbox` 상태(`failed`), `CORS_ORIGINS`·SMTP 설정 확인.

```bash
python3 scripts/test_smtp.py --to <본인메일>
```

---

## 7. 로컬 개발 (선택)

신규 스택(FastAPI):

```bash
cd apps/api && source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
TOPIK_API_BASE=http://127.0.0.1:8000 python3 build.py
cd public && python3 -m http.server 8080
```

PostgreSQL은 로컬 설치, 또는 IwinV DB VPS 원격 연결. 상세: [`apps/api/README.md`](../apps/api/README.md).

레거시 Fastify(`api/`) 로컬 실행: [`api/로컬실행_가이드.md`](../api/로컬실행_가이드.md) (참조용).

`MAIL_PROVIDER=console`이면 개발 환경에서만 `dev_code` 반환.

---

## 8. 관련 문서

| 문서 | 내용 |
|------|------|
| [`IWINV_SETUP.md`](IWINV_SETUP.md) | Web/DB VPS 상세 절차 |
| [`DEV_SPEC.md`](DEV_SPEC.md) | 개발 스펙·환경 변수 |
| [`배포_아키텍처.md`](기능정의서/배포_아키텍처.md) | 아키텍처 개요 |
| [`고객사_DNS_요청_템플릿.md`](고객사_DNS_요청_템플릿.md) | DNS IT 요청서 |
| [`apps/api/README.md`](../apps/api/README.md) | FastAPI 로컬·migration |
