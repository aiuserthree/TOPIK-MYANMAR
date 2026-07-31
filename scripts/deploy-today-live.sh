#!/usr/bin/env bash
# 오늘 변경분 → 운영 Web VPS (로컬 Mac에서 실행, SSH 비밀번호 입력)
# 사용: bash scripts/deploy-today-live.sh
set -euo pipefail

SERVER="${DEPLOY_SERVER:-root@115.68.222.58}"
REMOTE="${DEPLOY_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Sync API + BO + FO → ${SERVER}:${REMOTE}"

rsync -avz \
  --exclude '.venv' --exclude 'var' --exclude '__pycache__' --exclude '.env' \
  "${ROOT}/apps/api/app/" "${SERVER}:${REMOTE}/apps/api/app/"

rsync -avz \
  "${ROOT}/html/C안/BO(admin)/" "${SERVER}:${REMOTE}/html/C안/BO(admin)/"

rsync -avz \
  "${ROOT}/html/C안/FO/mypage-profile.html" \
  "${SERVER}:${REMOTE}/html/C안/FO/mypage-profile.html"

rsync -avz \
  "${ROOT}/build.py" "${ROOT}/build-bo.py" \
  "${SERVER}:${REMOTE}/"

echo "==> Remote: API restart + FO/BO build"
ssh "${SERVER}" bash -s <<EOF
set -euo pipefail
cd "${REMOTE}"
cd apps/api
source .venv/bin/activate
pip install -q -r requirements.txt
cd "${REMOTE}"
systemctl restart myanmar-api
sleep 3
systemctl is-active myanmar-api
curl -sf http://127.0.0.1:8000/health || { journalctl -u myanmar-api -n 20 --no-pager; exit 1; }
python3 build-bo.py
python3 build.py
grep -q '수납 명단' public-bo/panels/applicants.jsx && echo "OK: payment roster UI deployed"
grep -q 'payment_roster' apps/api/app/routers/admin_api.py && echo "OK: payment roster API deployed"
test -f apps/api/app/lib/payment_roster.py && echo "OK: payment_roster.py present"
EOF

echo ""
echo "==> Done. https://admin.topik-myanmar.com (Cmd+Shift+R)"
