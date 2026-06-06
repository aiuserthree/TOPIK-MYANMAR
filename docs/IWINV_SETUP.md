# Iwinv VPS 운영 서버 설정 가이드

이 문서는 `Myanmar_v2.0` 프로젝트를 Iwinv VPS 2대에 배포하기 위한 실무 절차입니다.

- Web 서버: Vite 정적 빌드(`apps/web/dist`) + FastAPI(`apps/api`) + nginx
- DB 서버: PostgreSQL 15+
- 오브젝트 스토리지: IwinV S3 호환 API (`https://kr.object.iwinv.kr`) — 회원 사진·파일 업로드용 (별도 서비스, AWS 계정 불필요)
- 배포 방식: Docker 사용 안 함
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
DATABASE_URL=postgresql+asyncpg://topik_app:CHANGE_ME_STRONG_PASSWORD@115.68.227.1:5432/topik_myanmar
JWT_SECRET=CHANGE_ME_LONG_RANDOM_SECRET
CORS_ORIGINS=https://www.topik-myanmar.com,https://admin.topik-myanmar.com
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

### 1.11 레거시 BO (임시 정적 제공)

신규 BO는 최종적으로 `apps/web`에 통합합니다. 그 전까지 **화면 디자인 handoff**는 `html/C안/BO(admin)/project/`에 있습니다 (`admin-login.html`, `admin.html`, 패널 14개). 운영 API 연동 stub은 `html/C안/BO/`(HTML 없음, JS 4개)이며, 루트의 `build-bo.py`도 **`BO/`만 복사**하므로 handoff UI를 그대로 배포하려면 스크립트 수정 또는 경로 정리가 필요합니다.

**FO vs BO 경로 분리**

| 구분 | 경로 | 비고 |
| --- | --- | --- |
| FO (신규) | `/` → `apps/web/dist/` | §1.9 nginx 설정 |
| BO (임시) | `/admin/` (권장) | handoff 정적 파일. FO SPA와 분리 |

**임시 nginx 예시** — handoff를 Web 서버에 두고 `/admin/`으로 제공합니다. 원본 경로에 한글·괄호(`BO(admin)`)가 있으므로 **ASCII 심볼릭 링크** 사용을 권장합니다.

```bash
sudo ln -sf "/opt/myanmar-v2/html/C안/BO(admin)/project" /opt/myanmar-v2/bo-handoff
```

nginx `server` 블록(§1.9)에 추가:

```nginx
    location /admin/ {
        alias /opt/myanmar-v2/bo-handoff/;
        index admin-login.html;
        try_files $uri $uri/ /admin/admin-login.html;
    }
```

로컬 미리보기: `admin-login.html` 또는 `admin.html`을 정적 서버로 열면 됩니다 (React/Babel은 CDN 로드).

**CORS:** 운영 확정 도메인은 FO `https://www.topik-myanmar.com`, BO `https://admin.topik-myanmar.com`(별도 서브도메인)입니다. `apps/api/.env`의 `CORS_ORIGINS`에 **양쪽 origin**을 포함합니다.

```env
CORS_ORIGINS=https://www.topik-myanmar.com,https://admin.topik-myanmar.com
```

BO를 FO와 **같은 도메인**(`/admin/` 경로)으로만 둘 경우 BO origin은 생략할 수 있으나, 현재 확정 구성은 서브도메인 분리입니다.

레거시 Fastify `api/.env`의 `PUBLIC_BO_BASE`도 실제 BO URL과 일치시킵니다.

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
curl -i http://www.topik-myanmar.com/
curl -i https://www.topik-myanmar.com/api/health
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

**레거시 Fastify** — `api/.env` (로컬·Railway·셀프호스트 공통, `api/.env.example` 참고):

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
| `STORAGE_PROVIDER` | `local`(개발·임시) 또는 `s3`(운영 권장) |
| `S3_BUCKET` | 콘솔에서 만든 버킷 이름 |
| `S3_REGION` | `kr-standard` |
| `S3_ACCESS_KEY` / `S3_SECRET` | 인증키 관리에서 발급 |
| `S3_ENDPOINT` | `https://kr.object.iwinv.kr` (IwinV 필수) |
| `S3_PREFIX` | (선택) 버킷 내 객체 키 prefix, 예: `photos` |

필수 S3 변수가 빠지면 레거시 API는 경고 후 `local`로 폴백합니다. 운영에서는 반드시 `s3`와 전체 변수를 설정합니다.

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

## 6. 메일 발송 (Resend)

회원가입 인증 코드·비밀번호 재설정 등 **트랜잭션 메일**은 API의 `email_outbox` 워커가 발송합니다. 프로젝트는 `MAIL_PROVIDER=console|resend|smtp`를 지원합니다 (`api/.env.example` 참고).

### 6.1 운영 확정 값

| 항목 | 값 | 비고 |
| --- | --- | --- |
| FO | `https://www.topik-myanmar.com` | DNS `A` → Web VPS |
| BO | `https://admin.topik-myanmar.com` | DNS `A` → Web VPS (또는 별도 호스팅) |
| `MAIL_FROM` | `noreply@topik-myanmar.com` | Resend 도메인 검증 후 사용 |
| Google OAuth origin | `https://www.topik-myanmar.com` | [고객사_DNS_요청_템플릿.md](고객사_DNS_요청_템플릿.md) §7 |

> **도메인 구매·DNS 위임 대기:** `topik-myanmar.com` 등록 및 IT DNS 접근 전까지는 `MAIL_PROVIDER=console`(또는 dev Resend 도메인)로 개발·스테이징을 진행합니다. **운영 오픈 직전** Resend 도메인 검증·SPF/DKIM 등록·아래 환경 변수를 적용합니다.

### 6.2 Resend 권장 (IwinV 메일·VPS SMTP 비권장)

| 방식 | 평가 | 이유 |
| --- | --- | --- |
| **Resend** + DNS SPF/DKIM | **운영 권장** | API 키만으로 연동, 발송·바운스 추적, 트랜잭션 메일 전달률·운영 부담이 낮음 |
| IwinV **테라웹메일** / **그룹웨어** / **마이메일러** (SMTP) | 대안 | SMTP 발송은 가능하나 트랜잭션 메일·대량 발송·모니터링에 부적합. `MAIL_PROVIDER=smtp`로 폴백만 고려 |
| VPS **Postfix** 자체 발송 | 비권장 | IP 평판·스팸 분류·역방향 DNS·유지보수 부담. 이 프로젝트에서는 사용하지 않음 |

가입 인증·비밀번호 재설정 메일은 **수신함 도달률**이 중요하므로 Resend와 발신 도메인 DNS 인증을 기본으로 합니다.

### 6.3 API 환경 변수

레거시 Fastify `api/.env`와 Web VPS `apps/api/.env`에 동일하게 설정합니다. (마이그레이션 기간 동안 둘 다 사용할 수 있음)

**운영 예** — `apps/api/.env` (또는 `api/.env`):

```env
MAIL_PROVIDER=resend
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
RESEND_API_KEY=re_xxxxxxxx
MAIL_SUPPORT=support@topik-myanmar.com
ENABLE_EMAIL_WORKER=true
PUBLIC_FO_BASE=https://www.topik-myanmar.com
PUBLIC_BO_BASE=https://admin.topik-myanmar.com
```

| 변수 | 설명 |
| --- | --- |
| `MAIL_PROVIDER` | `console`(개발·로그만), `resend`(운영), `smtp`(대안) |
| `MAIL_FROM` | 확정 발신 주소 `noreply@topik-myanmar.com` — Resend 도메인과 일치해야 함 |
| `RESEND_API_KEY` | [Resend](https://resend.com) 대시보드 → API Keys |
| `ENABLE_EMAIL_WORKER` | `email_outbox` drain 워커 (운영 `true`) |
| `PUBLIC_FO_BASE` / `PUBLIC_BO_BASE` | 메일·딥링크용 FO/BO URL |

Web 서버에 반영하는 예:

```bash
cat >> /opt/myanmar-v2/apps/api/.env <<'EOF'
MAIL_PROVIDER=resend
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
RESEND_API_KEY=re_xxxxxxxx
ENABLE_EMAIL_WORKER=true
PUBLIC_FO_BASE=https://www.topik-myanmar.com
PUBLIC_BO_BASE=https://admin.topik-myanmar.com
EOF
chmod 600 /opt/myanmar-v2/apps/api/.env
sudo systemctl restart myanmar-api
```

개발 기본값은 `MAIL_PROVIDER=console`이며, 인증 코드·재설정 토큰은 API 응답의 `dev_code` / `dev_reset_token`으로 확인합니다.

### 6.4 DNS — SPF · DKIM · DMARC

Resend 대시보드 → **Domains** → `topik-myanmar.com` 추가 후 표시되는 레코드를 DNS에 등록합니다. 고객사 IT 요청용 상세 표·검증 절차는 [고객사_DNS_요청_템플릿.md §6](고객사_DNS_요청_템플릿.md#6-이메일-발신--spf--dkim--dmarc)을 따릅니다.

요약:

- **SPF** — TXT `@`: Resend가 안내하는 `include:…` 값
- **DKIM** — CNAME `*._domainkey`: Resend 대시보드 발급 호스트
- **DMARC** — TXT `_dmarc`: 초기 `p=none` 권장

도메인 상태가 **Verified**인지 확인한 뒤 FO에서 회원가입·비밀번호 재설정 메일 발송을 테스트합니다.

### 6.5 대안 — IwinV 메일 SMTP

IwinV **마이메일러** 등에서 SMTP 호스트·포트·계정을 발급받은 경우:

```env
MAIL_PROVIDER=smtp
MAIL_FROM=TOPIK Myanmar <noreply@topik-myanmar.com>
SMTP_HOST=smtp.iwinv.kr
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=발급_계정
SMTP_PASS=발급_비밀번호
```

테라웹메일·그룹웨어는 **사람이 웹메일로 읽는 용도**에 가깝고, API 트랜잭션 발송의 기본 경로로는 권장하지 않습니다. Resend 연동이 불가할 때만 SMTP 폴백을 검토합니다.

### 6.6 동작 확인

1. Resend 대시보드에서 `topik-myanmar.com` **Verified**
2. API 재시작 후 FO 회원가입 → 인증 메일 수신 (또는 Resend Logs)
3. 비밀번호 재설정 메일 발송
4. `email_outbox`에 `failed` 누적이 없는지 확인 (`ENABLE_EMAIL_WORKER=true` 시)
