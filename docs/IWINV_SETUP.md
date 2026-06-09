# Iwinv VPS 운영 서버 설정 가이드

이 문서는 `Myanmar_v2.0` 프로젝트를 Iwinv VPS 2대에 배포하기 위한 실무 절차입니다.

- Web 서버: Vite 정적 빌드(`apps/web/dist`) + FastAPI(`apps/api`) + nginx
- DB 서버: PostgreSQL 15+ **+ pgvector**
- 오브젝트 스토리지: IwinV S3 호환 API (`https://kr.object.iwinv.kr`) — 회원 사진·파일 업로드용 (별도 서비스, AWS 계정 불필요)
- 배포 방식: nginx + systemd (Web VPS), apt PostgreSQL (DB VPS)
- 방화벽: Iwinv ELCAP에서 먼저 제한하고, 서버 내부 `ufw`로 같은 규칙을 한 번 더 적용

아래 값은 현재 확정된 운영 서버 값입니다. **운영 도메인·발신 메일 주소는 확정**되었으나 도메인 구매·DNS 위임은 아직 진행 중입니다. `REPO_URL`, 비밀번호 값은 실제 운영 값으로 바꿔서 사용합니다.

```text
WEB_SERVER_IP=115.68.222.58
DB_SERVER_IP=115.68.227.1
ADMIN_IP=39.115.174.100
FO_DOMAIN=www.topik-myanmar.com
BO_DOMAIN=admin.topik-myanmar.com
MAIL_FROM=noreply@topik-myanmar.com
GOOGLE_OAUTH_ORIGIN=https://www.topik-myanmar.com
REPO_URL=Git_저장소_URL
APP_DIR=/opt/myanmar-v2
```

`ADMIN_IP`가 동적 IP라서 변경되면 ELCAP과 `ufw`의 SSH 허용 규칙을 새 IP로 다시 업데이트해야 합니다.

## 방화벽 설정 (확정 IP)

### ELCAP rules (콘솔 설정)

Iwinv 콘솔의 ELCAP에서 아래 인바운드 규칙을 적용합니다.

#### Web server (115.68.222.58)

- 인바운드 TCP `80`, `443`: `0.0.0.0/0`
- 인바운드 TCP `22`: `39.115.174.100`만 허용

#### DB server (115.68.227.1)

- 인바운드 TCP `5432`: `115.68.222.58`만 허용
- 인바운드 TCP `22`: `39.115.174.100`만 허용

### ufw commands (copy-paste ready)

Web server:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 39.115.174.100 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

DB server:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 39.115.174.100 to any port 22 proto tcp
sudo ufw allow from 115.68.222.58 to any port 5432 proto tcp
sudo ufw enable
```

## 1. Web 서버 설정

### 1.1 Ubuntu 초기 보안 설정

root로 접속한 뒤 패키지를 업데이트합니다.

```bash
sudo apt update
sudo apt upgrade -y
```

운영 계정을 따로 둘 경우 아래처럼 생성합니다. 이미 사용할 계정이 있으면 생략해도 됩니다.

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
```

SSH는 비밀번호 로그인을 끄고 키 기반 접속을 권장합니다.

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 1.2 ELCAP 방화벽 규칙

Iwinv 콘솔의 ELCAP에서 Web 서버에 아래 인바운드 규칙을 적용합니다.

| 포트 | 프로토콜 | 허용 대상 | 용도 |
| --- | --- | --- | --- |
| 22 | TCP | `39.115.174.100/32` | SSH 관리 |
| 80 | TCP | `0.0.0.0/0` | HTTP |
| 443 | TCP | `0.0.0.0/0` | HTTPS |

SSH `22`번은 절대 전체 공개(`0.0.0.0/0`)로 열지 않습니다.

### 1.3 ufw mirror 규칙

ELCAP과 같은 정책을 서버 내부에도 적용합니다.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 39.115.174.100 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

### 1.4 런타임 설치

Node.js 20 LTS, Python 3.11, nginx, certbot을 설치합니다.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git build-essential
```

Ubuntu 버전에 따라 Python 3.11 패키지가 기본 저장소에 없을 수 있습니다. `python3.11` 설치가 실패하면 deadsnakes PPA를 추가한 뒤 다시 설치합니다.

```bash
sudo apt install -y python3.11 python3.11-venv python3.11-dev
python3.11 --version
node --version
npm --version
```

필요 시:

```bash
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev
```

### 1.5 애플리케이션 배치

```bash
sudo mkdir -p /opt/myanmar-v2
sudo chown -R "$USER":"$USER" /opt/myanmar-v2
git clone REPO_URL /opt/myanmar-v2
cd /opt/myanmar-v2
```

FastAPI 의존성을 설치합니다.

```bash
cd /opt/myanmar-v2/apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Vite 프론트엔드 의존성을 설치하고 production build를 생성합니다. 빌드 결과물은 `apps/web/dist/`에 생성됩니다.

```bash
cd /opt/myanmar-v2/apps/web
npm ci
npm run build
```

### 1.6 FastAPI 운영 환경 변수

`apps/api/.env`를 생성합니다.

```bash
cat > /opt/myanmar-v2/apps/api/.env <<'EOF'
APP_ENV=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar
JWT_SECRET=CHANGE_ME_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS
JWT_REFRESH_SECRET=CHANGE_ME_ANOTHER_LONG_RANDOM_SECRET
CORS_ORIGINS=https://www.topik-myanmar.com,https://admin.topik-myanmar.com
STORAGE_PROVIDER=s3
S3_BUCKET=topik-myanmar-photos
S3_REGION=kr-standard
S3_ACCESS_KEY=발급받은_Access_Key_ID
S3_SECRET=발급받은_Secret_Key
S3_ENDPOINT=https://kr.object.iwinv.kr
S3_PREFIX=photos
MAIL_PROVIDER=smtp
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
SMTP_HOST=mail.topik-myanmar.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@topik-myanmar.com
SMTP_PASS=테라웹메일_noreply_계정_비밀번호
ENABLE_EMAIL_WORKER=true
PUBLIC_FO_BASE=https://www.topik-myanmar.com
EOF
chmod 600 /opt/myanmar-v2/apps/api/.env
```

`DATABASE_URL`의 DB 서버 IP는 Web 서버에서 접근 가능한 `115.68.227.1`을 사용합니다. 같은 사설망이 따로 제공되면 보안상 사설 IP 사용을 우선 검토합니다.

회원 사진·파일 업로드를 영구 저장하려면 [5. IwinV 오브젝트 스토리지](#5-iwinv-오브젝트-스토리지)에서 버킷과 인증키를 만든 뒤, 같은 `apps/api/.env`에 S3 관련 변수를 추가합니다. (레거시 Fastify `api/.env`도 동일 패턴)

### 1.7 Vite 운영 환경 변수

Vite는 **빌드 시점**에 `VITE_*` 환경 변수를 번들에 포함합니다. nginx에서 `/api`를 FastAPI로 프록시하므로 같은 도메인의 `/api` 경로를 사용합니다.

```bash
cat > /opt/myanmar-v2/apps/web/.env.production <<'EOF'
VITE_API_URL=/api
EOF
chmod 600 /opt/myanmar-v2/apps/web/.env.production
```

환경변수를 바꾼 뒤에는 Vite build를 다시 실행합니다.

```bash
cd /opt/myanmar-v2/apps/web
npm run build
sudo nginx -t && sudo systemctl reload nginx
```

프론트엔드는 Node.js 프로세스 없이 nginx가 `dist/` 정적 파일만 제공합니다. 별도 systemd web 서비스는 필요 없습니다.

### 1.8 systemd: FastAPI

```bash
sudo tee /etc/systemd/system/myanmar-api.service > /dev/null <<'EOF'
[Unit]
Description=Myanmar v2 FastAPI
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/myanmar-v2/apps/api
EnvironmentFile=/opt/myanmar-v2/apps/api/.env
ExecStart=/opt/myanmar-v2/apps/api/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
User=deploy
Group=deploy

[Install]
WantedBy=multi-user.target
EOF
```

`deploy` 계정을 만들지 않았다면 `User`와 `Group`을 실제 배포 계정으로 바꿉니다.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myanmar-api
sudo systemctl status myanmar-api --no-pager
```

### 1.9 nginx: 정적 파일 + API reverse proxy

프론트엔드는 `apps/web/dist/`를 직접 제공하고, `/api/`는 FastAPI로 프록시합니다. SPA 라우팅을 위해 `try_files`로 `index.html` fallback을 설정합니다.

```bash
sudo tee /etc/nginx/sites-available/myanmar-v2 > /dev/null <<'EOF'
server {
    listen 80;
    server_name www.topik-myanmar.com;

    client_max_body_size 20m;

    root /opt/myanmar-v2/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/myanmar-v2 /etc/nginx/sites-enabled/myanmar-v2
sudo nginx -t
sudo systemctl reload nginx
```

`/api/health` 확인:

```bash
curl -i http://127.0.0.1:8000/health
curl -i http://www.topik-myanmar.com/api/health
```

### 1.10 SSL 인증서

DNS의 `A` 레코드가 Web 서버 IP를 가리킨 뒤 실행합니다.

```bash
sudo certbot --nginx -d www.topik-myanmar.com -d admin.topik-myanmar.com
sudo certbot renew --dry-run
```

### 1.11 레거시 BO (handoff 정적 + admin 서브도메인)

신규 BO는 최종적으로 `apps/web`에 통합합니다. 그 전까지 **운영 BO**는 `html/C안/BO(admin)/project/` handoff UI를 `build-bo.py`로 빌드해 `public-bo/`에 배치합니다.

**빌드 (Web 서버, 저장소 루트):**

```bash
cd /opt/myanmar-v2
# 운영: TOPIK_API_BASE 생략 → same-origin /api (nginx 프록시)
python3 build-bo.py
# 로컬 API 연동 미리보기만: TOPIK_API_BASE=http://127.0.0.1:8000 python3 build-bo.py
```

| 구분 | 경로 | nginx root |
| --- | --- | --- |
| FO (레거시 C안) | `python3 build.py` → `public/` | `www.topik-myanmar.com` |
| FO (신규 Vite) | `apps/web/dist/` | 동일 (배포 시 하나 선택) |
| BO (handoff) | `public-bo/` | `admin.topik-myanmar.com` |

**BO 서브도메인 nginx** — FO와 **별도 `server` 블록**이며, BO origin에서도 `/api/`를 FastAPI로 프록시해야 `bo-api-client.js` same-origin 호출이 동작합니다.

```bash
sudo tee /etc/nginx/sites-available/myanmar-bo > /dev/null <<'EOF'
server {
    listen 80;
    server_name admin.topik-myanmar.com;

    client_max_body_size 20m;

    root /opt/myanmar-v2/public-bo;
    index admin-login.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /admin-login.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/myanmar-bo /etc/nginx/sites-enabled/myanmar-bo
sudo nginx -t && sudo systemctl reload nginx
```

**주의:** `admin-login.html`·`admin.html`에 `127.0.0.1` meta를 넣지 마세요. 운영은 meta 없이 same-origin `/api`를 사용합니다. 로컬 개발만 `TOPIK_API_BASE=http://127.0.0.1:8000 python3 build-bo.py` 또는 HTML `<meta name="topik-api-base" content="http://127.0.0.1:8000">`를 사용합니다.

**CORS:** `apps/api/.env`의 `CORS_ORIGINS`에 FO·BO origin **양쪽** 포함.

```env
CORS_ORIGINS=https://www.topik-myanmar.com,https://admin.topik-myanmar.com
```

**운영 DB 시드 (데모 계정 금지):**

```bash
cd /opt/myanmar-v2
# migration V001~V006 적용 후
CONFIRM_PROD_SEED=1 python3 scripts/seed_prod.py   # 제107회 + 지역코드 (demo 계정 없음)
ADMIN_EMAIL=admin@topik-myanmar.com ADMIN_PASSWORD='강한비밀번호' python3 scripts/create_admin.py
```

`scripts/seed_dev.py`는 **운영에서 실행 금지** — `demo@topik-mm.local` / `admin-dev@topik-mm.local`이 생성됩니다.

## 2. DB 서버 설정

### 2.1 Ubuntu 초기 보안 설정

```bash
sudo apt update
sudo apt upgrade -y
```

운영 계정이 필요하면 생성합니다.

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
```

### 2.2 ELCAP 방화벽 규칙

Iwinv 콘솔의 ELCAP에서 DB 서버에 아래 인바운드 규칙을 적용합니다.

| 포트 | 프로토콜 | 허용 대상 | 용도 |
| --- | --- | --- | --- |
| 22 | TCP | `39.115.174.100/32` | SSH 관리 |
| 5432 | TCP | `115.68.222.58/32` | PostgreSQL |

PostgreSQL `5432`는 Web 서버 IP에서만 접근 가능해야 합니다.

### 2.3 ufw mirror 규칙

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 39.115.174.100 to any port 22 proto tcp
sudo ufw allow from 115.68.222.58 to any port 5432 proto tcp
sudo ufw enable
sudo ufw status verbose
```

### 2.4 PostgreSQL 15+ 설치

Ubuntu 기본 저장소의 PostgreSQL 버전이 15 이상이면 그대로 설치합니다.

```bash
sudo apt install -y postgresql postgresql-contrib
psql --version
```

15 미만이 설치되는 Ubuntu라면 PostgreSQL 공식 저장소를 추가합니다.

```bash
sudo apt install -y curl ca-certificates gnupg
sudo install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib
psql --version
```

### 2.4.1 pgvector extension (의미 검색·RAG)

FAQ/공지 의미 검색, RAG 챗봇, 유사 문의·중복 접수 탐지를 위해 **pgvector** 패키지를 설치합니다. PostgreSQL 메이저 버전에 맞는 패키지명을 사용합니다.

```bash
sudo apt install -y postgresql-15-pgvector
sudo -u postgres psql -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

`CREATE EXTENSION vector` 및 `semantic_chunks` 테이블은 migration **V007**(§2.8)에서 적용합니다. V007은 **postgres superuser**로 실행하며, `sudo -u postgres psql -f …`는 OS user `postgres`가 파일 경로를 직접 열기 때문에 `/root` 등 제한 디렉터리에서는 `Permission denied`가 납니다. §2.8의 **stdin 리다이렉트**(`< 절대경로`) 방식을 사용하세요. 적용 후 Web API `GET /health/db` 응답에 `"pgvector": true`가 포함됩니다.

### 2.5 DB와 계정 생성

강한 비밀번호로 바꿔서 실행합니다.

```bash
sudo -u postgres psql <<'EOF'
CREATE DATABASE topik_myanmar;
CREATE USER topik_app WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE topik_myanmar TO topik_app;
\c topik_myanmar
GRANT ALL ON SCHEMA public TO topik_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO topik_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO topik_app;
EOF
```

### 2.6 원격 접속 설정

PostgreSQL 설정 경로를 확인합니다.

```bash
sudo -u postgres psql -tAc "SHOW config_file;"
sudo -u postgres psql -tAc "SHOW hba_file;"
```

`postgresql.conf`의 `listen_addresses`를 수정합니다.

```bash
sudo sed -i "s/^#\?listen_addresses = .*/listen_addresses = '*'/" /etc/postgresql/15/main/postgresql.conf
```

실제 경로가 `/etc/postgresql/15/main/postgresql.conf`와 다르면 위에서 확인한 `config_file` 경로로 바꿔 실행합니다.

`pg_hba.conf`에는 Web 서버 IP만 허용합니다.

```bash
echo "host    topik_myanmar    topik_app    115.68.222.58/32    scram-sha-256" | sudo tee -a /etc/postgresql/15/main/pg_hba.conf
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
```

경로가 다르면 위에서 확인한 `hba_file` 경로로 바꿉니다.

### 2.7 Web 서버에서 DB 연결 테스트

Web 서버에서 실행합니다.

```bash
sudo apt install -y postgresql-client
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -c "select now();"
```

FastAPI의 `DATABASE_URL`은 asyncpg 드라이버를 포함합니다.

```env
DATABASE_URL=postgresql+asyncpg://topik_app:PASSWORD@115.68.227.1:5432/topik_myanmar
```

### 2.8 기존 migration 적용

migration 파일은 현재 저장소의 `db/migrations`에 있습니다. Web 서버 또는 DB 서버 중 저장소가 있는 곳에서 순서대로 적용합니다.

```bash
cd /opt/myanmar-v2
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V001__initial_schema.sql
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V002__email_outbox_retry.sql
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V003__bo_integration.sql
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V004__user_last_login.sql
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V005__application_drafts.sql
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V006__fo_contract_and_security.sql
# V007: root(또는 현재 셸)가 파일을 읽고 postgres가 SQL 실행 — -f 상대경로는 /root 등에서 Permission denied
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar" -f db/migrations/V008__exam_venue_name_my.sql
# V007: root(또는 현재 셸)가 파일을 읽고 postgres가 SQL 실행
sudo -u postgres psql -d topik_myanmar < /opt/myanmar-v2/db/migrations/V007__pgvector_semantic_search.sql
```

또는 일괄: `bash scripts/run-migrations.sh` (V007은 superuser 별도 적용 권장).

V007의 `CREATE EXTENSION`은 **postgres superuser** 권한이 필요합니다. `topik_app`으로 V007을 실행하면 extension 생성에서 실패합니다.

저장소가 DB VPS에 없으면 로컬에서 `scp db/migrations/V007__pgvector_semantic_search.sql root@115.68.227.1:/tmp/` 후:

```bash
chmod 644 /tmp/V007__pgvector_semantic_search.sql
sudo -u postgres psql -d topik_myanmar < /tmp/V007__pgvector_semantic_search.sql
```

`-f` 절대경로를 쓸 경우 상위 디렉터리가 `postgres`에게 traversable 해야 합니다 (`chmod o+x /opt /opt/myanmar-v2` 등).

DB 서버에서 로컬로 적용한다면 host를 `127.0.0.1`로 바꿀 수 있습니다.

```bash
psql "postgresql://topik_app:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/topik_myanmar" -f db/migrations/V001__initial_schema.sql
```

### 2.9 백업 cron

백업 디렉터리를 만들고 `pg_dump`를 매일 새벽 3시에 실행합니다.

```bash
sudo mkdir -p /var/backups/topik_myanmar
sudo chown postgres:postgres /var/backups/topik_myanmar
```

```bash
sudo -u postgres crontab -e
```

아래 줄을 추가합니다.

```cron
0 3 * * * pg_dump -Fc topik_myanmar > /var/backups/topik_myanmar/topik_myanmar_$(date +\%Y\%m\%d_\%H\%M).dump
```

복구 예시:

```bash
createdb topik_myanmar_restore
pg_restore -d topik_myanmar_restore /var/backups/topik_myanmar/topik_myanmar_YYYYMMDD_HHMM.dump
```

## 3. 배포 후 점검

### 3.1 서비스 상태

Web 서버에서 확인합니다.

```bash
sudo systemctl status myanmar-api --no-pager
sudo systemctl status nginx --no-pager
curl -i http://127.0.0.1:8000/health
curl -i http://www.topik-myanmar.com/
curl -i https://www.topik-myanmar.com/api/health
curl -i https://admin.topik-myanmar.com/api/health
curl -i https://admin.topik-myanmar.com/admin-login.html
```

### 3.2 로그 확인

```bash
sudo journalctl -u myanmar-api -f
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

### 3.3 코드 업데이트 절차

```bash
cd /opt/myanmar-v2
git pull

cd /opt/myanmar-v2/apps/api
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart myanmar-api

cd /opt/myanmar-v2/apps/web
npm ci
npm run build

cd /opt/myanmar-v2
python3 build.py
python3 build-bo.py
sudo nginx -t && sudo systemctl reload nginx
```

DB migration이 추가되면 `db/migrations`의 새 파일을 순서대로 적용한 뒤 API를 재시작합니다.

### 3.4 운영 스모크 테스트 (스테이징 없이 단일 배포 후)

아래 순서로 **한 번에** 검증합니다. 실패 시 해당 단계 로그를 확인한 뒤 다음 단계로 진행하지 마세요.

| # | 단계 | 확인 방법 | 기대 결과 |
| --- | --- | --- | --- |
| 1 | API 기동 | `curl -s https://www.topik-myanmar.com/api/health` | `{"status":"ok"}` |
| 2 | S3 연결 | FO 가입 또는 프로필 사진 업로드 | 500 없음, DB `file_attachments` 행 생성 |
| 3 | 사진 조회 | 브라우저 `<img>` / `GET /api/v1/files/:id?token=` | 이미지 표시 (S3 프록시) |
| 4 | FO 회원가입 | `signup.html` → 인증 메일 | `email_outbox.status=sent` (SMTP 미준비 시 `mail_delivered:false`) |
| 5 | 접수 | `register.html` 제107회 접수 | `applications` 행, 사진 스냅샷 `file_id` |
| 6 | BO 로그인 | `https://admin.topik-myanmar.com/admin-login.html` | `create_admin.py` 계정으로 로그인, Network 탭 API가 **same-origin `/api`** |
| 7 | BO 사진 | 접수 상세 패널 | `TopikBoApi.fileUrl` 이미지 표시 |
| 8 | BO 승인/반려 | 테스트 접수 처리 | `email_outbox` 트랜잭션 메일 enqueue |
| 9 | BO zip | 사진 zip / 연명부 다운로드 | zip/xlsx 수신 |

**S3 스모크 (CLI, Web 서버):** §5.6 AWS CLI put/list 후 3~7번으로 API 경유 최종 확인.

**SMTP 미완(DNS 대기) 시:** 가입은 가능하나 `mail_delivered:false` — DNS·테라웹메일 확정 후 §6.6 9~11번 재검.

## 4. 보안 체크리스트

- ELCAP에서 Web 서버는 `80`, `443`만 전체 공개하고 `22`는 `39.115.174.100`만 허용합니다.
- ELCAP에서 DB 서버는 `5432`를 `115.68.222.58`에만 허용하고 전체 공개하지 않습니다.
- `ufw` 규칙이 ELCAP과 동일하게 설정되어 있는지 확인합니다.
- 관리자 접속 IP(`39.115.174.100`)가 바뀌면 ELCAP과 `ufw`의 SSH 허용 규칙을 즉시 업데이트합니다.
- `apps/api/.env`, `apps/web/.env.production` 권한은 `600`으로 유지합니다.
- `JWT_SECRET`과 DB 비밀번호는 충분히 긴 랜덤 문자열을 사용합니다.
- PostgreSQL `pg_hba.conf`는 `115.68.222.58/32`만 허용합니다.
- `DATABASE_URL`에는 `topik_app` 계정을 사용하고 `postgres` 슈퍼유저를 앱에서 사용하지 않습니다.
- SSL 인증서 발급 후 운영 트래픽은 FO `https://www.topik-myanmar.com`, BO `https://admin.topik-myanmar.com`을 사용합니다.
- 백업 파일이 생성되는지 주기적으로 확인하고, 별도 저장소로 복사하는 정책을 정합니다.
- 오브젝트 스토리지 Access Key / Secret Key는 Git에 커밋하지 않고, `.env` 권한 `600`을 유지합니다. 키 유출 시 IwinV 콘솔에서 즉시 폐기·재발급합니다.

## 5. IwinV 오브젝트 스토리지

Web VPS 디스크나 DB 서버와 **별도**인 IwinV 오브젝트 스토리지입니다. S3 호환 REST API를 제공하며, 엔드포인트는 `https://kr.object.iwinv.kr`, 리전은 `kr-standard`입니다. AWS 계정 없이 IwinV 콘솔만으로 사용할 수 있습니다.

### 5.1 개요

| 항목 | 값 |
| --- | --- |
| 서비스 | IwinV 오브젝트 스토리지 (S3 호환) |
| API 엔드포인트 | `https://kr.object.iwinv.kr` |
| 리전 | `kr-standard` |
| AWS 계정 | 불필요 |

DB는 PostgreSQL VPS에, 정적 파일·API는 Web VPS에 두지만 **업로드 파일(사진 등)은 오브젝트 스토리지**에 저장하는 구성을 권장합니다.

### 5.2 언제 사용하는가

다음 용도에 사용합니다.

- 회원 가입·프로필·접수 증명 사진
- 기타 API를 통한 파일 업로드

Web VPS 로컬 디스크(`STORAGE_PROVIDER=local`)에 저장하면 `git pull` 후 재배포·서버 교체 시 파일이 **함께 사라집니다**. 운영 환경에서는 `STORAGE_PROVIDER=s3`와 IwinV 버킷을 사용해 업로드를 영구 보관합니다.

이 프로젝트는 사진을 **API가 프록시**해 제공합니다(`GET /api/v1/files/:id` 등). 버킷을 퍼블릭으로 열 필요는 없으며 **Private 버킷**으로 두고 API만 Access Key로 객체에 접근하면 됩니다.

### 5.3 IwinV 콘솔 설정

1. [IwinV 콘솔](https://www.iwinv.kr/) → **오브젝트 스토리지** → **신청** (미사용 시)
2. **버킷 생성** — 예: `topik-myanmar-photos` (프로젝트·환경별로 구분 가능)
3. **인증키 관리** → **Access Key ID** / **Secret Key** 발급 (계정당 최대 2개)
4. **버킷 정책** — 이 프로젝트는 API 경유 제공이므로 Private 유지를 권장. 퍼블릭 읽기 정책은 CDN·직링크가 필요할 때만 검토합니다.

상세 매뉴얼:

- [오브젝트 스토리지 소개](https://www.iwinv.kr/storage/obj)
- [버킷 생성·관리](https://help.iwinv.kr/manual/712)
- [인증키 관리](https://help.iwinv.kr/manual/790)

### 5.4 API 환경 변수

사진·파일 저장 설정은 Fastify 레거시 API와 신규 FastAPI **양쪽** `.env`에 동일한 변수명으로 넣습니다. (마이그레이션 기간 동안 둘 다 쓸 수 있음)

**레거시 Fastify** — `api/.env` (로컬·참조용, `api/.env.example` 참고):

```env
STORAGE_PROVIDER=s3
S3_BUCKET=topik-myanmar-photos
S3_REGION=kr-standard
S3_ACCESS_KEY=발급받은_Access_Key_ID
S3_SECRET=발급받은_Secret_Key
S3_ENDPOINT=https://kr.object.iwinv.kr
S3_PREFIX=photos
```

**신규 FastAPI** — Web VPS의 `apps/api/.env`에 위와 **같은 블록**을 추가합니다. (`apps/api/.env.example` 주석 참고)

Web 서버에서 FastAPI `.env`에 반영하는 예:

```bash
cat >> /opt/myanmar-v2/apps/api/.env <<'EOF'
STORAGE_PROVIDER=s3
S3_BUCKET=topik-myanmar-photos
S3_REGION=kr-standard
S3_ACCESS_KEY=발급받은_Access_Key_ID
S3_SECRET=발급받은_Secret_Key
S3_ENDPOINT=https://kr.object.iwinv.kr
S3_PREFIX=photos
EOF
chmod 600 /opt/myanmar-v2/apps/api/.env
sudo systemctl restart myanmar-api
```

| 변수 | 설명 |
| --- | --- |
| `STORAGE_PROVIDER` | `local`(개발 전용) 또는 `s3`(운영 필수) |
| `S3_BUCKET` | 콘솔에서 만든 버킷 이름 |
| `S3_REGION` | `kr-standard` |
| `S3_ACCESS_KEY` / `S3_SECRET` | 인증키 관리에서 발급 |
| `S3_ENDPOINT` | `https://kr.object.iwinv.kr` (IwinV 필수) |
| `S3_PREFIX` | (선택) 버킷 내 객체 키 prefix, 예: `photos` |

`STORAGE_PROVIDER=s3`에서 필수 S3 변수가 빠지면 API는 시작 또는 저장 시 명확히 실패합니다. 운영에서는 조용한 local 폴백을 허용하지 않으므로, 배포 전 실제 IwinV 인증키로 업로드·조회·사진 zip 스모크를 수행합니다.

### 5.5 네트워크

- **Web 서버** → `kr.object.iwinv.kr` **아웃바운드 HTTPS(443)** 가 필요합니다. (기본 `ufw default allow outgoing`이면 추가 규칙 없음)
- **DB 서버**에는 오브젝트 스토리지용 **인바운드 규칙이 필요 없습니다**. (PostgreSQL만 Web IP에서 접근)

ELCAP·`ufw`에서 DB `5432`를 Web IP로만 제한한 정책과 충돌하지 않습니다.

### 5.6 동작 확인

**AWS CLI** (Web 서버 또는 로컬, [aws cli](https://aws.amazon.com/cli/) 설치 후):

```bash
export AWS_ACCESS_KEY_ID=발급받은_Access_Key_ID
export AWS_SECRET_ACCESS_KEY=발급받은_Secret_Key
export AWS_DEFAULT_REGION=kr-standard

aws s3 ls s3://topik-myanmar-photos/ \
  --endpoint-url https://kr.object.iwinv.kr

echo "iwinv-test" | aws s3 cp - s3://topik-myanmar-photos/photos/_connectivity_test.txt \
  --endpoint-url https://kr.object.iwinv.kr
```

**curl**만 사용할 경우 S3 서명이 필요해 번거롭습니다. CLI 테스트 후 **배포된 API에서 실제 파일 업로드**(가입·프로필 사진 등)로 최종 확인하는 것을 권장합니다.

### 5.7 보안

- Access Key / Secret Key는 **Git·슬랙·티켓에 올리지 않습니다**. `.env`만 사용하고 `chmod 600`을 유지합니다.
- 키는 계정당 **최대 2개** — 로테이션 시 새 키 발급 → `.env` 교체 → API 재시작 → 구 키 폐기 순서를 따릅니다.
- 버킷은 Private 유지, 필요한 읽기는 API와 IAM 수준의 Access Key로만 수행합니다.
- `.env.example`에는 placeholder만 두고 실제 키는 IwinV 콘솔에서만 관리합니다.

## 6. 메일 발송 (IwinV 테라웹메일 SMTP)

회원가입 인증 코드·비밀번호 재설정 등 **트랜잭션 메일**은 API의 `email_outbox` 워커가 발송합니다. 이 배포는 **IwinV 테라웹메일 SMTP**를 운영 기본으로 사용합니다 (`MAIL_PROVIDER=smtp`). 실제 구현은 일반 SMTP 설정(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)만 사용하므로 특정 벤더 전용 코드에 묶이지 않습니다. 개발 시 `MAIL_PROVIDER=console`(로그만)을 사용합니다 (`apps/api/.env.example` 참고).

메일 HTML 본문은 기존 **C안 에디토리얼** (`시안/email/templates/`, `apps/api/app/lib/email_render.py`)을 그대로 사용합니다.

### 6.1 운영 확정 값

| 항목 | 값 | 비고 |
| --- | --- | --- |
| FO | `https://www.topik-myanmar.com` | DNS `A` → Web VPS |
| BO | `https://admin.topik-myanmar.com` | DNS `A` → Web VPS (또는 별도 호스팅) |
| 기본 자동 발신 계정 | `noreply@topik-myanmar.com` | API `SMTP_USER` 및 `MAIL_FROM` 권장 |
| SMTP host | `mail.topik-myanmar.com` | 테라웹메일에서 도메인 연결 후 사용하는 일반적인 도메인 메일 호스트 |
| SMTP port | `587` | STARTTLS, `SMTP_SECURE=false` |
| Google OAuth origin | `https://www.topik-myanmar.com` | [고객사_DNS_요청_템플릿.md](고객사_DNS_요청_템플릿.md) §7 |

> **주의:** 테라웹메일 콘솔 또는 IwinV 안내 메일에 `mail.topik-myanmar.com`이 아닌 별도 SMTP 서버명이 표시되면 콘솔 값을 우선합니다. MX/SPF/DKIM 값도 IwinV가 발급한 정확한 값을 DNS에 등록해야 합니다.

### 6.2 계정 전략 (약 5개)

테라웹메일에서 도메인 `topik-myanmar.com`을 연결한 뒤 아래처럼 역할별 계정을 만드는 것을 권장합니다.

| 계정 | 용도 | API 사용 여부 |
| --- | --- | --- |
| `noreply@topik-myanmar.com` | 회원가입 인증, 비밀번호 재설정, 접수 알림 등 자동 발송 | **사용** (`SMTP_USER`, `MAIL_FROM`) |
| `support@topik-myanmar.com` | 사용자 문의 응대, 반송·수신 확인 | API 직접 사용 안 함 |
| `admin@topik-myanmar.com` | 운영자/관리자 대표 메일 | API 직접 사용 안 함 |
| `privacy@topik-myanmar.com` | 개인정보 문의·삭제 요청 | API 직접 사용 안 함 |
| `test@topik-myanmar.com` | SMTP·수신 테스트, 운영 전 검증 | 테스트 시에만 임시 사용 가능 |

API는 여러 계정을 모두 쓰지 않습니다. 운영 기본은 `noreply@topik-myanmar.com` 한 계정으로 SMTP 인증과 발신 주소를 맞추는 방식입니다. 사람에게 답변이 필요한 메일은 `support@`나 `admin@` 수신함으로 관리하고, 자동 발신 메일 footer에는 문의처를 별도로 안내합니다.

### 6.3 테라웹메일 신청·도메인 연결

1. [IwinV 콘솔](https://www.iwinv.kr)에서 **테라웹메일** 서비스를 신청합니다.
2. 사용할 도메인으로 `topik-myanmar.com`을 등록하거나 연결합니다.
3. 콘솔에서 위 계정 5개를 생성하고 각 계정의 초기 비밀번호를 강하게 설정합니다.
4. `noreply@topik-myanmar.com` 계정으로 웹메일 로그인이 되는지 확인합니다.
5. 콘솔이 안내하는 **MX**, **SPF**, 제공 시 **DKIM** 값을 확인해 DNS에 등록합니다.

### 6.4 DNS — MX / SPF / DKIM / DMARC

DNS는 `topik-myanmar.com` 도메인을 관리하는 곳에서 등록합니다. IwinV에서 도메인 DNS를 관리하면 IwinV DNS 콘솔에, 다른 등록기관/Cloudflare를 쓰면 해당 DNS 콘솔에 입력합니다.

| 종류 | 이름/호스트 | 값 | 목적 |
| --- | --- | --- | --- |
| `MX` | `@` 또는 빈 값 | `IwinV 테라웹메일 콘솔에서 안내하는 MX 서버` | `@topik-myanmar.com`으로 들어오는 메일을 테라웹메일로 수신 |
| `TXT` | `@` 또는 빈 값 | `v=spf1 ... ~all` 형식의 IwinV 테라웹메일 SPF 값 | 테라웹메일이 `topik-myanmar.com` 발신자로 메일을 보낼 권한 증명 |
| `TXT`/`CNAME` | 콘솔 안내 selector | `IwinV 테라웹메일 DKIM 값` | 제공되는 경우 권장. 메일 위변조 방지 서명 |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@topik-myanmar.com` | 초기 모니터링 권장. 안정화 후 정책 강화 검토 |

**MX 등록 순서:**

1. DNS 콘솔에서 레코드 추가를 선택합니다.
2. 유형을 `MX`로 선택합니다.
3. 이름/호스트는 루트 도메인을 뜻하는 `@`를 입력합니다. 콘솔이 빈 값을 요구하면 비워 둡니다.
4. 값/대상에는 IwinV 테라웹메일 콘솔이 안내한 MX 서버명을 그대로 입력합니다. 이 문서에는 확정 MX 호스트가 없으므로 임의 호스트를 추정하지 않습니다.
5. 우선순위(priority)는 숫자가 낮을수록 먼저 시도됩니다. IwinV가 `10`, `20`처럼 여러 MX와 priority를 안내하면 안내된 값 그대로 모두 추가합니다.
6. 기존에 다른 메일 서비스의 MX가 있으면 충돌을 피하기 위해 제거 또는 비활성화합니다.

**SPF 등록 순서:**

1. DNS 콘솔에서 `TXT` 레코드를 추가합니다.
2. 이름/호스트는 `@`를 입력합니다.
3. 값에는 IwinV 테라웹메일 콘솔이 안내한 SPF TXT 값을 그대로 입력합니다. 보통 `v=spf1 include:... ~all` 또는 `v=spf1 ip4:... ~all` 형태이며, 정확한 `include:`/IP 값은 IwinV 화면 값을 사용합니다.
4. 이미 SPF 레코드(`v=spf1 ...`)가 있으면 SPF TXT를 여러 개 만들지 말고 하나로 병합해야 합니다. 예: 기존 Google/다른 서비스가 있으면 IwinV 안내 `include:` 또는 `ip4:`/`ip6:` 값을 같은 `v=spf1` 안에 추가합니다.
5. 마지막 정책은 초기에는 `~all` 권장, IwinV 안내가 다르면 콘솔 값을 우선합니다.

**DKIM/DMARC:**

- DKIM은 테라웹메일 콘솔이 selector와 TXT/CNAME 값을 제공하는 경우 등록합니다. 제공되지 않으면 생략할 수 있지만, 제공된다면 수신함 도달률을 위해 등록을 권장합니다.
- DMARC는 IwinV가 필수로 요구하지 않아도 `_dmarc.topik-myanmar.com`에 `p=none`으로 먼저 등록해 모니터링하고, 발송 안정화 후 `quarantine` 또는 `reject`로 강화합니다.

**전파·검증 순서:**

1. DNS 레코드를 저장한 뒤 최소 10~30분 기다립니다. DNS 업체 TTL과 캐시에 따라 최대 24~48시간까지 지연될 수 있습니다.
2. `dig MX topik-myanmar.com`으로 MX 서버와 priority가 IwinV 안내값과 일치하는지 확인합니다.
3. `dig TXT topik-myanmar.com`으로 SPF가 한 줄만 존재하고, 그 안에 IwinV가 안내한 `include:` 또는 IP 값이 포함되어 있는지 확인합니다.
4. DKIM을 등록했다면 `dig TXT <selector>._domainkey.topik-myanmar.com` 또는 IwinV가 안내한 CNAME 조회로 값이 보이는지 확인합니다.
5. `dig TXT _dmarc.topik-myanmar.com`으로 DMARC가 조회되는지 확인합니다.
6. DNS 조회가 정상화된 뒤 `python3 scripts/test_smtp.py --to <본인메일> --dry-run`으로 앱 설정을 확인하고, 실제 발송 테스트에서 수신 메일 원문의 SPF/DKIM/DMARC 결과를 확인합니다.

### 6.5 API 환경 변수

Web VPS `apps/api/.env`에 아래 값을 설정합니다. 레거시 Fastify API를 동시에 운영한다면 `api/.env`에도 같은 메일 블록을 맞춥니다.

```env
MAIL_PROVIDER=smtp
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
SMTP_HOST=mail.topik-myanmar.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@topik-myanmar.com
SMTP_PASS=테라웹메일_noreply_계정_비밀번호
ENABLE_EMAIL_WORKER=true
PUBLIC_FO_BASE=https://www.topik-myanmar.com
```

| 변수 | 설명 |
| --- | --- |
| `MAIL_PROVIDER` | `console`(개발·로그만), `smtp`(운영·IwinV 테라웹메일) |
| `MAIL_FROM` | 사용자에게 보이는 발신자. 운영 기본 `TOPIK Myanmar <noreply@topik-myanmar.com>` |
| `SMTP_HOST` | 일반적으로 `mail.topik-myanmar.com`; 콘솔 안내값이 다르면 그 값을 사용 |
| `SMTP_PORT` / `SMTP_SECURE` | `587` + `false`는 STARTTLS. 콘솔이 `465` SSL을 안내하면 `SMTP_PORT=465`, `SMTP_SECURE=true` |
| `SMTP_USER` / `SMTP_PASS` | 테라웹메일에서 만든 실제 메일 계정과 비밀번호 |
| `ENABLE_EMAIL_WORKER` | `email_outbox` drain 워커 (운영 `true`) |
| `PUBLIC_FO_BASE` | 메일·딥링크용 FO URL |

Web 서버에 반영하는 예:

```bash
cat >> /opt/myanmar-v2/apps/api/.env <<'EOF'
MAIL_PROVIDER=smtp
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
SMTP_HOST=mail.topik-myanmar.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@topik-myanmar.com
SMTP_PASS=테라웹메일_noreply_계정_비밀번호
ENABLE_EMAIL_WORKER=true
PUBLIC_FO_BASE=https://www.topik-myanmar.com
EOF
chmod 600 /opt/myanmar-v2/apps/api/.env
sudo systemctl restart myanmar-api
```

개발 기본값은 `MAIL_PROVIDER=console`이며, 회원가입·비밀번호 재설정 인증코드는 API 응답의 `dev_code`로 확인합니다. 비밀번호 재설정 토큰은 `verify-reset-code` 성공 후 내부 흐름에서만 사용합니다.

### 6.6 단계별 연동 절차 (체크리스트)

1. **테라웹메일 신청** — IwinV 콘솔에서 테라웹메일 신청 후 `topik-myanmar.com` 연결
2. **메일 계정 생성** — `noreply@`, `support@`, `admin@`, `privacy@`, `test@` 생성
3. **DNS MX 등록** — 콘솔이 안내한 MX 서버·우선순위를 DNS에 등록
4. **DNS SPF 등록** — 콘솔이 안내한 SPF TXT를 루트 도메인 `@`에 등록
5. **DKIM/DMARC 등록** — DKIM 제공 시 등록, DMARC는 초기 `p=none` 권장
6. **웹메일 로그인 확인** — `noreply@topik-myanmar.com`으로 로그인·수신 테스트
7. **`.env` 반영** — `apps/api/.env`에 §6.5 값 입력
8. **API 재시작** — `sudo systemctl restart myanmar-api` (로컬: uvicorn 재기동)
9. **SMTP 스모크** — `python3 scripts/test_smtp.py --to your@email.com` (설정만 확인: `--dry-run`)
10. **FO 회원가입** — `POST /api/v1/auth/send-verification-code` 후 수신함·스팸함 확인
11. **outbox 확인** — `SELECT id, template_key, status, last_error FROM email_outbox ORDER BY id DESC LIMIT 10;` (`failed` 없어야 함)

### 6.7 동작 확인

1. IwinV 테라웹메일 계정·도메인 연결·DNS MX/SPF 등록 확인
2. `python3 scripts/test_smtp.py --to <본인메일> --dry-run`으로 설정 확인
3. `python3 scripts/test_smtp.py --to <본인메일>` 성공
4. API 재시작 후 FO 회원가입 → 인증 메일 수신 (C형 레이아웃·인증코드 박스)
5. 비밀번호 재설정 메일 발송 (6자리 인증코드 박스)
6. `email_outbox`에 `failed` 누적이 없는지 확인 (`ENABLE_EMAIL_WORKER=true` 시)
