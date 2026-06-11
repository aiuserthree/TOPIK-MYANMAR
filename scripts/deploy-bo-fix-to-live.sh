#!/usr/bin/env bash
# 로컬 Mac에서 실행 → 운영 Web VPS에 BO/API 수정 반영
# 사용: bash scripts/deploy-bo-fix-to-live.sh
set -euo pipefail

SERVER="${DEPLOY_SERVER:-root@115.68.222.58}"
REMOTE="${DEPLOY_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Upload BO + API files to ${SERVER}:${REMOTE}"
scp "${ROOT}/apps/api/app/routers/admin_api.py" \
  "${SERVER}:${REMOTE}/apps/api/app/routers/admin_api.py"
scp "${ROOT}/html/C안/BO(admin)/project/assets/data.js" \
  "${ROOT}/html/C안/BO(admin)/project/assets/app.jsx" \
  "${ROOT}/html/C안/BO(admin)/project/assets/bo-api-bridge.js" \
  "${SERVER}:${REMOTE}/html/C안/BO(admin)/project/assets/"
scp "${ROOT}/html/C안/BO(admin)/project/panels/applicants.jsx" \
  "${SERVER}:${REMOTE}/html/C안/BO(admin)/project/panels/applicants.jsx"
scp "${ROOT}/html/C안/BO(admin)/project/shared/bo-api-client.js" \
  "${SERVER}:${REMOTE}/html/C안/BO(admin)/project/shared/bo-api-client.js"
scp "${ROOT}/html/shared/bo-api-client.js" \
  "${SERVER}:${REMOTE}/html/shared/bo-api-client.js"

echo "==> Remote build + API restart (한 번의 SSH)"
ssh "${SERVER}" bash -s <<EOF
set -euo pipefail
cd "${REMOTE}"
cd apps/api && source .venv/bin/activate && pip install -q -r requirements.txt
cd "${REMOTE}"
systemctl restart myanmar-api
sleep 3
systemctl is-active myanmar-api
curl -sf http://127.0.0.1:8000/health || echo "WARN: /health curl failed (API may still be starting)"
python3 build-bo.py
grep -q "unpaid" public-bo/assets/data.js && echo "badge unpaid OK"
grep -q "applicantReadyForApprove" public-bo/panels/applicants.jsx && echo "approve guard OK"
grep -q "filterApplicantAudit" public-bo/panels/applicants.jsx && echo "audit filter OK"
grep -q "fetchApplicantAudit" public-bo/assets/bo-api-bridge.js && echo "audit API OK"
EOF

echo ""
echo "==> Done. https://admin.topik-myanmar.com — Cmd+Shift+R 로 새로고침"
