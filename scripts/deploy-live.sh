#!/usr/bin/env bash
# C안 FO/BO → 운영 도메인 배포 (Web VPS에서 실행)
# 사용: bash scripts/deploy-live.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

echo "==> APP_ROOT=${APP_ROOT}"

echo "==> Build C안 FO → public/"
python3 build.py

echo "==> Build C안 BO → public-bo/"
python3 build-bo.py

echo "==> Python deps"
cd apps/api
if [[ ! -d .venv ]]; then
  python3.11 -m venv .venv || python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

echo "==> DB migrations"
cd "${APP_ROOT}"
bash scripts/run-migrations.sh || echo "WARN: migration step had errors — continuing (V007 ownership 등)"

echo "==> systemd (myanmar-api)"
cp "${APP_ROOT}/scripts/systemd/myanmar-api-v2.service" /etc/systemd/system/myanmar-api.service
systemctl daemon-reload
systemctl enable myanmar-api
systemctl restart myanmar-api
sleep 2
systemctl is-active myanmar-api
curl -sf http://127.0.0.1:8000/health || { journalctl -u myanmar-api -n 30 --no-pager; exit 1; }

echo "==> nginx (C안 static + /api proxy)"
rm -f /etc/nginx/sites-enabled/myanmar-v2 /etc/nginx/sites-enabled/default 2>/dev/null || true
cp "${APP_ROOT}/scripts/nginx/myanmar-v2.conf" /etc/nginx/sites-available/myanmar-v2.conf
ln -sf /etc/nginx/sites-available/myanmar-v2.conf /etc/nginx/sites-enabled/myanmar-v2.conf
nginx -t
systemctl reload nginx

echo ""
echo "==> Done:"
echo "  FO  https://www.topik-myanmar.com/index.html"
echo "  BO  https://admin.topik-myanmar.com/admin.html"
