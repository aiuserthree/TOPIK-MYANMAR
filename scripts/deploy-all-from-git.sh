#!/usr/bin/env bash
# GitHub origin/main → 운영 전체 반영 (API + BO + FO + migration)
# Web VPS: bash scripts/deploy-all-from-git.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

echo "==> Fetch origin/main"
git fetch origin

echo "==> Checkout latest code (API + BO + FO + db + scripts)"
git checkout origin/main -- \
  apps/api/app/ \
  apps/api/requirements.txt \
  "html/C안/BO(admin)/" \
  "html/C안/FO/" \
  html/shared/ \
  db/migrations/ \
  build.py \
  build-bo.py \
  scripts/

echo "==> DB migrations (V009/V010 등)"
bash scripts/run-migrations.sh || echo "WARN: migration step had errors — continuing"

echo "==> Python deps + API restart"
cd apps/api
if [[ ! -d .venv ]]; then
  python3.11 -m venv .venv || python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
cd "${APP_ROOT}"

cp scripts/systemd/myanmar-api-v2.service /etc/systemd/system/myanmar-api.service
systemctl daemon-reload
systemctl restart myanmar-api
sleep 2
systemctl is-active myanmar-api
curl -sf http://127.0.0.1:8000/health

echo "==> Build FO + BO static"
python3 build.py
python3 build-bo.py

echo "==> Verify"
echo "  FO pages: $(find public -maxdepth 1 -name '*.html' | wc -l | tr -d ' ')"
echo "  BO admin: $(test -f public-bo/admin.html && echo ok || echo MISSING)"
grep -q "처리 사유" public-bo/panels/audit.jsx && echo "  audit.jsx: 처리 사유 OK" || echo "  audit.jsx: OLD"
grep -q "memo" apps/api/app/routers/admin_api.py && echo "  admin_api: memo OK"

echo ""
echo "==> Done. 확인:"
echo "  https://admin.topik-myanmar.com → 처리 이력 상세 → 처리 사유"
echo "  https://www.topik-myanmar.com"
