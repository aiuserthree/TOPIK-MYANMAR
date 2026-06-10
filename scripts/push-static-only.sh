#!/usr/bin/env bash
# 로컬에서 빌드한 FO/BO 정적 산출물만 운영 nginx root에 반영
# Mac 로컬: bash scripts/push-static-only.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
echo "==> Build FO → public/, BO → public-bo/"
python3 build.py
python3 build-bo.py

echo "==> Push html source (FO) → ${SERVER}:${APP_ROOT}/html/"
rsync -avz \
  --exclude '.git' \
  "${ROOT}/html/" "${SERVER}:${APP_ROOT}/html/"

echo "==> Push static → ${SERVER}:${APP_ROOT}/public/ + public-bo/"
rsync -avz --delete "${ROOT}/public/" "${SERVER}:${APP_ROOT}/public/"
rsync -avz --delete "${ROOT}/public-bo/" "${SERVER}:${APP_ROOT}/public-bo/"

echo "==> Verify (remote)"
ssh "${SERVER}" "for f in guide-overview.html guide-intro.html rules-fee.html apply-howto.html ticket.html notice.html; do test -f ${APP_ROOT}/public/\$f && md5sum ${APP_ROOT}/public/\$f | awk '{print \$1, \$2}'; done"

echo "==> Done. 브라우저에서 Cmd+Shift+R (강력 새로고침) 하세요."
