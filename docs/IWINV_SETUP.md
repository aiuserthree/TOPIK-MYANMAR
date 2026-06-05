# Iwinv VPS 운영 서버 설정 가이드

이 문서는 `Myanmar_v2.0` 프로젝트를 Iwinv VPS 2대에 배포하기 위한 실무 절차입니다.

- Web 서버: Vite 정적 빌드(`apps/web/dist`) + FastAPI(`apps/api`) + nginx
- DB 서버: PostgreSQL 15+
- 배포 방식: Docker 사용 안 함
- 방화벽: Iwinv ELCAP에서 먼저 제한하고, 서버 내부 `ufw`로 같은 규칙을 한 번 더 적용

아래 값은 현재 확정된 운영 서버 값입니다. `YOUR_DOMAIN`, `REPO_URL`, 비밀번호 값은 실제 운영 값으로 바꿔서 사용합니다.

```text
WEB_SERVER_IP=115.68.222.58
DB_SERVER_IP=115.68.227.1
ADMIN_IP=39.115.174.100
YOUR_DOMAIN=운영_도메인
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
DATABASE_URL=postgresql+asyncpg://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar
JWT_SECRET=CHANGE_ME_LONG_RANDOM_SECRET
CORS_ORIGINS=https://YOUR_DOMAIN,http://YOUR_DOMAIN
EOF
chmod 600 /opt/myanmar-v2/apps/api/.env
```

`DATABASE_URL`의 DB 서버 IP는 Web 서버에서 접근 가능한 `115.68.227.1`을 사용합니다. 같은 사설망이 따로 제공되면 보안상 사설 IP 사용을 우선 검토합니다.

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
    server_name YOUR_DOMAIN;

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
curl -i http://YOUR_DOMAIN/api/health
```

### 1.10 SSL 인증서

DNS의 `A` 레코드가 Web 서버 IP를 가리킨 뒤 실행합니다.

```bash
sudo certbot --nginx -d YOUR_DOMAIN
sudo certbot renew --dry-run
```

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
```

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
curl -i http://YOUR_DOMAIN/
curl -i https://YOUR_DOMAIN/api/health
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
sudo nginx -t && sudo systemctl reload nginx
```

DB migration이 추가되면 `db/migrations`의 새 파일을 순서대로 적용한 뒤 API를 재시작합니다.

## 4. 보안 체크리스트

- ELCAP에서 Web 서버는 `80`, `443`만 전체 공개하고 `22`는 `39.115.174.100`만 허용합니다.
- ELCAP에서 DB 서버는 `5432`를 `115.68.222.58`에만 허용하고 전체 공개하지 않습니다.
- `ufw` 규칙이 ELCAP과 동일하게 설정되어 있는지 확인합니다.
- 관리자 접속 IP(`39.115.174.100`)가 바뀌면 ELCAP과 `ufw`의 SSH 허용 규칙을 즉시 업데이트합니다.
- `apps/api/.env`, `apps/web/.env.production` 권한은 `600`으로 유지합니다.
- `JWT_SECRET`과 DB 비밀번호는 충분히 긴 랜덤 문자열을 사용합니다.
- PostgreSQL `pg_hba.conf`는 `115.68.222.58/32`만 허용합니다.
- `DATABASE_URL`에는 `topik_app` 계정을 사용하고 `postgres` 슈퍼유저를 앱에서 사용하지 않습니다.
- SSL 인증서 발급 후 운영 트래픽은 `https://YOUR_DOMAIN`을 사용합니다.
- 백업 파일이 생성되는지 주기적으로 확인하고, 별도 저장소로 복사하는 정책을 정합니다.
