#!/usr/bin/env bash
# 로컬 FO(public/)와 운영 정적 파일 동기화 — GIS·profile_incomplete·GNB 가드 포함
# Mac 로컬에서 실행: bash scripts/push-fo-parity.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
python3 build.py

echo "==> Push FO static → ${SERVER}:${APP_ROOT}/public (HTML + JS, cache-bust ?v= in HTML)"
rsync -avz "${ROOT}/public/"*.html "${SERVER}:${APP_ROOT}/public/"
rsync -avz "${ROOT}/public/assets/styles.css" "${ROOT}/public/assets/common.js" "${SERVER}:${APP_ROOT}/public/assets/"
rsync -avz "${ROOT}/public/shared/api-client.js" "${SERVER}:${APP_ROOT}/public/shared/"

echo "==> Verify (remote curl via ssh)"
ssh "${SERVER}" "grep -c showGenericGoogleButton ${APP_ROOT}/public/login.html; grep -c showGenericGoogleButton ${APP_ROOT}/public/signup.html"

echo "==> Done."
