# TOPIK Myanmar — 배포 체크리스트 (IwinV + FastAPI)

> **운영 목표:** IwinV VPS 2대(Web + DB) · nginx + systemd · FastAPI(`apps/api`) · PostgreSQL 15+ pgvector · IwinV 테라웹메일 SMTP · IwinV S3  
> 상세 절차: [`IWINV_SETUP.md`](IWINV_SETUP.md) · 개발 스펙: [`DEV_SPEC.md`](DEV_SPEC.md) · DNS IT 요청: [`고객사_DNS_요청_템플릿.md`](고객사_DNS_요청_템플릿.md)

---

## 배포 스크립트 선택 (먼저 읽기)

일상 배포에 쓰는 스크립트는 **두 개**입니다. 둘 다 Web VPS(`/opt/myanmar-v2`)에서 실행하며,
`origin/main` 을 작업 트리에 체크아웃하는 방식은 같습니다. 차이는 **무엇까지 건드리느냐**와
**실패했을 때 어떻게 되느냐**입니다.

| | `deploy-all-from-git.sh` | `deploy-app-from-git.sh` |
| --- | --- | --- |
| 범위 | 전체 — 스키마·유닛·nginx 포함 | 앱만 — FO/BO 정적 + API 코드 |
| DB migration | **실행** | 실행 안 함 |
| systemd 유닛 | 복사 + `daemon-reload` | 건드리지 않음 |
| nginx 설정 | `scripts/nginx/` 반영 + reload | 건드리지 않음 |
| API 반영 | `systemctl restart` — **수 초 중단** | `apps/api/` 가 바뀐 배포에서만 `reload`(SIGHUP) — **무중단** |
| 실패 시 | 롤백 없음 (migration 실패는 경고만 남기고 계속) | 직전 배포 커밋으로 **자동 롤백** |
| 배포 지점 추적 | 없음 | `.deployed-commit` 표식 |
| 미리보기 | 없음 | `DRY_RUN=1` |
| 로그 | 표준 출력 | `/var/log/myanmar-deploy-app.log` + 표준 출력 |
| 전제 | 사람이 지켜보는 대화형 | **예약 실행(무인)** |

### `deploy-all-from-git.sh` 를 써야 하는 경우

아래 중 하나라도 해당하면 이쪽입니다. `deploy-app-from-git.sh` 는 이 셋을 아예 건드리지 않으므로
반영되지 않습니다.

1. `db/migrations/` 에 새 SQL 이 추가됨
2. `scripts/systemd/` 유닛 또는 `apps/api/.env` 변경 — systemd 는 이 값을 **기동 시에만** 읽으므로
   reload 로는 반영되지 않습니다
3. `scripts/nginx/` 설정 변경

```bash
cd /opt/myanmar-v2
git fetch origin
bash scripts/deploy-all-from-git.sh
```

### 그 외에는 `deploy-app-from-git.sh`

앱 코드·정적 파일만 바뀐 배포는 이쪽이 낫습니다 — 무중단이고, 검증에 실패하면 직전 커밋으로 되돌립니다.

```bash
bash scripts/deploy-app-from-git.sh              # 지금 실행
DRY_RUN=1 bash scripts/deploy-app-from-git.sh    # 무엇을 할지만 출력
RESTART_API=1 bash scripts/deploy-app-from-git.sh  # 리로드 대신 완전 재시작
```

**왜 재시작이 아니라 리로드인가** — 2026-08-20 배포에서 `restart` 가 워커 2개를 동시에 내려
수 초간 502 가 나갔고 응시자 3명이 실제로 겪었습니다. gunicorn 마스터가 소켓을 붙든 채 워커를
하나씩 교체하는 `reload` 는 요청을 떨어뜨리지 않습니다. 다만 `.env`·유닛 변경은 reload 로
반영되지 않으니 그때는 `RESTART_API=1` 또는 `deploy-all-from-git.sh` 를 씁니다.

### 주의 — migration 실패가 배포를 멈추지 않습니다

`deploy-all-from-git.sh` 의 migration 단계는 이렇게 되어 있습니다.

```bash
bash scripts/run-migrations.sh || echo "WARN: migration step had errors — continuing"
```

실패해도 API 재시작·정적 빌드가 그대로 진행됩니다. 배포 로그에서 **`WARN: migration step had errors`**
를 반드시 확인하십시오. 특히 V007(pgvector)이 미적용이면 `run-migrations.sh` 가 거기서 멈추고
**V008 이후가 누락된 채** 배포가 정상 종료됩니다 (§2 참고).

### 두 스크립트가 모두 `main()` 으로 감싸여 있는 이유

실행 도중 `git checkout … -- scripts/` 로 **자기 자신을 덮어쓰기** 때문입니다. bash 는 스크립트를
파일 오프셋 기준으로 이어 읽으므로, 실행 중 파일이 바뀌면 엉뚱한 위치를 읽어 깨집니다. 함수 정의는
호출 전에 통째로 파싱되므로 마지막 줄 `main "$@"` 까지 읽히고 나면 영향을 받지 않습니다.
**이 구조를 풀지 마십시오.**

### 그 외 `scripts/deploy-*.sh` · `push-*.sh`

특정 시점의 일회성 패치 반영용으로 남아 있는 것들입니다(로컬 Mac 에서 SSH 로 밀어넣는 것 포함).
일상 배포에는 쓰지 않습니다. 예외적으로 **정적만 재빌드**해야 할 때는
`scripts/deploy-static-live.sh` (migration·API 재시작 없음)를 씁니다.

---

## 1. 인프라 준비

> 아래 1~5번은 **최초 구축용** 체크리스트입니다. 현재 운영 환경은 이미 전부 프로비저닝되어 서비스 중이며, 일상 배포는 위 [배포 스크립트 선택](#배포-스크립트-선택-먼저-읽기)을 따릅니다.

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

DB VPS에서 `V001` → `V023` 순서로 migration 적용. V007(`CREATE EXTENSION vector`)는 **postgres superuser** + stdin 리다이렉트로 **먼저** 실행합니다.

```bash
cd /opt/myanmar-v2
# 1) V007 — superuser 선행 (IWINV_SETUP.md §2.8)
#    run-migrations.sh는 ON_ERROR_STOP=1이라, extension이 없으면 V007에서 중단되고
#    V008 이후가 적용되지 않는다.
sudo -u postgres psql -d topik_myanmar < /opt/myanmar-v2/db/migrations/V007__pgvector_semantic_search.sql

# 2) V001~V023 일괄 — topik_app
bash scripts/run-migrations.sh
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

> **`build-bo.py` 는 node 를 씁니다.** BO 의 JSX 19개를 빌드 때 미리 컴파일해
> (`scripts/precompile-jsx.js`) 브라우저에서 babel 로 매번 컴파일하던 것을 없앱니다.
> BO 부팅 시 받는 양이 962KB → 약 360KB 로 줄어듭니다(gzip 전송 기준 실측).
> babel standalone 하나가 668KB 를 차지하므로, 사전 컴파일하면 그게 통째로 빠집니다.
>
> node 가 없으면 빌드는 **깨지지 않고** 다음 경고를 남긴 뒤 기존 방식(브라우저 babel)
> 으로 산출물을 만듭니다 — 동작은 같고 느릴 뿐입니다.
>
> ```
> WARN: JSX 사전 컴파일을 건너뜁니다(...). 브라우저 babel 로 동작합니다.
> ```
>
> 이 경고가 보이면 서버에 node 를 설치(`apt install -y nodejs`)한 뒤 `python3 build-bo.py`
> 를 다시 실행하십시오. 빌드 결과에 `.jsx` 가 남아 있는지로도 확인할 수 있습니다
> (`find public-bo -name '*.jsx' | wc -l` → 사전 컴파일되면 `0`).

### nginx 압축 설정 (서버 재구축 시 필수)

Ubuntu 기본 `nginx.conf` 는 `gzip on;` 만 켜져 있고 **`gzip_types` 가 주석 처리**되어 있다.
그러면 nginx 기본값대로 `text/html` 만 압축하고 JS·CSS 는 원본 그대로 나간다.
2026-08-20 미얀마 현장 지연 점검에서 발견해 적용했다 — BO 자산이 3~4배, FO 자산도
같은 비율로 줄었다(예: `styles.css` 32.7KB → 8.1KB).

`/etc/nginx/nginx.conf` 의 http 블록:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_buffers 16 8k;
gzip_http_version 1.1;
# 이미 압축된 형식(woff2/png/jpg/zip)은 넣지 않는다 — 다시 압축해도 줄지 않고 CPU만 쓴다.
# text/html 은 nginx 가 항상 압축하므로 나열하지 않는다.
gzip_types text/plain text/css text/xml text/javascript
           application/javascript application/json application/xml
           application/xml+rss application/rss+xml image/svg+xml;
```

`/etc/nginx/mime.types` — `.jsx` 가 `application/octet-stream` 으로 나가면 압축 대상에서
빠지므로 매핑을 더한다(JSX 사전 컴파일이 적용되면 무의미해지지만, 폴백 경로에서는 필요):

```
application/javascript                js jsx;
```

적용은 `nginx -t` 로 검증한 뒤 `systemctl reload nginx`(무중단).

확인:

```bash
curl -sI -H 'Accept-Encoding: gzip' https://admin.topik-myanmar.com/vendor/react-dom-18.3.1.production.min.js | grep -i content-encoding
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
| 9 | BO **관리자 접근 로그** — 로그인 후 이력 표시 | `GET /api/v1/admin/access-logs/admins` (super) |
| 10 | FO 푸터 **개인정보처리방침** 볼드 표시 | `public/assets/styles.css` `.ft-policy-privacy` |

**운영 배포:** 어느 스크립트를 쓸지는 위의 [배포 스크립트 선택](#배포-스크립트-선택-먼저-읽기)을 따릅니다.
스키마·유닛·nginx 가 바뀌면 `deploy-all-from-git.sh`(소스 반영 → migration → API 재시작 → `build.py` + `build-bo.py`),
그 외 앱 변경은 `deploy-app-from-git.sh`(무중단 리로드 + 실패 시 자동 롤백)입니다.

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
| [`scripts/deploy-all-from-git.sh`](../scripts/deploy-all-from-git.sh) | 운영 전체 배포 (API+DB+FO+BO) |
| [`scripts/deploy-static-live.sh`](../scripts/deploy-static-live.sh) | FO/BO 정적만 재빌드 |
| [`scripts/deploy-app-from-git.sh`](../scripts/deploy-app-from-git.sh) | 앱 코드만 반영 (FO·BO 정적 + API) — 표식 기반 롤백, API 무중단 리로드 |
