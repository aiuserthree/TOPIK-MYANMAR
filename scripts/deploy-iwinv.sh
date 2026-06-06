#!/usr/bin/env bash
# IwinV Web VPS deploy — run on 115.68.222.58 as root or deploy user
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/topik-myanmar}"
REPO_URL="${REPO_URL:-git@github.com:your-org/Myanmar_v2.0.git}"
BRANCH="${BRANCH:-main}"

echo "==> Deploy TOPIK Myanmar @ ${APP_ROOT}"

if [[ ! -d "${APP_ROOT}/.git" ]]; then
  git clone "${REPO_URL}" "${APP_ROOT}"
fi

cd "${APP_ROOT}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Build FO/BO static"
python3 build.py
python3 build-bo.py

echo "==> Python API"
cd apps/api
if [[ ! -d .venv ]]; then
  python3.11 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

if [[ ! -f .env ]]; then
  echo "WARN: apps/api/.env missing — copy from .env.example and configure DB/S3/JWT"
  cp -n .env.example .env || true
fi

echo "==> DB migrations (psql)"
DB_URL="${DATABASE_URL_SYNC:-postgresql://topik_app@115.68.227.1:5432/topik_myanmar}"
for f in ../../db/migrations/V00*.sql; do
  echo "  applying $(basename "$f")"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "$f" || true
done
psql "${DB_URL}" -v ON_ERROR_STOP=1 -f ../../db/seed/prod_seed.sql || true

echo "==> Restart API"
sudo cp "${APP_ROOT}/scripts/systemd/myanmar-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable myanmar-api
sudo systemctl restart myanmar-api

echo "==> nginx"
sudo cp "${APP_ROOT}/scripts/nginx/topik-myanmar.conf" /etc/nginx/sites-available/topik-myanmar.conf
sudo ln -sf /etc/nginx/sites-available/topik-myanmar.conf /etc/nginx/sites-enabled/topik-myanmar.conf
sudo nginx -t
sudo systemctl reload nginx

echo "==> Done. Check:"
echo "  curl -s http://127.0.0.1:8000/health"
echo "  curl -s https://www.topik-myanmar.com/api/v1/auth/status"
