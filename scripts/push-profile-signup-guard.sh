#!/usr/bin/env bash
# 가입 미완료(profile_incomplete) GNB·페이지 가드 패치 — Mac 로컬에서 실행
# 사용: bash scripts/push-profile-signup-guard.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Build FO → public/ (로컬)"
cd "${ROOT}"
python3 build.py

echo "==> Push API patch → ${SERVER}:${APP_ROOT}/apps/api"
rsync -avz "${ROOT}/apps/api/app/lib/profile.py" "${SERVER}:${APP_ROOT}/apps/api/app/lib/"
rsync -avz "${ROOT}/apps/api/app/lib/deps.py" "${SERVER}:${APP_ROOT}/apps/api/app/lib/"
rsync -avz "${ROOT}/apps/api/app/routers/auth.py" "${SERVER}:${APP_ROOT}/apps/api/app/routers/"
rsync -avz "${ROOT}/apps/api/app/routers/me.py" "${SERVER}:${APP_ROOT}/apps/api/app/routers/"
rsync -avz "${ROOT}/apps/api/app/routers/applications.py" "${SERVER}:${APP_ROOT}/apps/api/app/routers/"
rsync -avz "${ROOT}/apps/api/app/routers/board.py" "${SERVER}:${APP_ROOT}/apps/api/app/routers/"

echo "==> Push FO static → ${SERVER}:${APP_ROOT}/public"
rsync -avz "${ROOT}/public/assets/common.js" "${SERVER}:${APP_ROOT}/public/assets/"
rsync -avz "${ROOT}/public/shared/api-client.js" "${SERVER}:${APP_ROOT}/public/shared/"
rsync -avz "${ROOT}/public/login.html" "${ROOT}/public/signup.html" "${SERVER}:${APP_ROOT}/public/"

echo "==> Restart API on server"
ssh "${SERVER}" "systemctl restart myanmar-api && sleep 2 && systemctl is-active myanmar-api && curl -s http://127.0.0.1:8000/health"

echo "==> Done."
