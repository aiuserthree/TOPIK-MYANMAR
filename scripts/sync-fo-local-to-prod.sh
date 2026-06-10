#!/usr/bin/env bash
# 로컬 html/C안/FO → 운영 public/ 그대로 반영 (Mac 또는 Web VPS)
# Mac:   bash scripts/sync-fo-local-to-prod.sh
# VPS:   bash scripts/sync-fo-local-to-prod.sh --on-server
set -euo pipefail

ON_SERVER=false
[[ "${1:-}" == "--on-server" ]] && ON_SERVER=true

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="${SERVER:-root@115.68.222.58}"

if $ON_SERVER; then
  cd "${APP_ROOT}"
  git fetch origin
  git checkout origin/main -- "html/C안/FO/" build.py build-bo.py
  python3 build.py
  echo "==> Done (server). HTML count: $(find public -maxdepth 1 -name '*.html' | wc -l | tr -d ' ')"
  md5sum public/guide-overview.html public/apply-howto.html
  exit 0
fi

cd "${ROOT}"
python3 build.py

echo "==> rsync html/C안/FO + public/ → ${SERVER}:${APP_ROOT}"
rsync -avz "${ROOT}/html/C안/FO/" "${SERVER}:${APP_ROOT}/html/C안/FO/"
rsync -avz "${ROOT}/public/" "${SERVER}:${APP_ROOT}/public/"

echo "==> Verify remote md5"
ssh "${SERVER}" "md5sum ${APP_ROOT}/public/guide-overview.html ${APP_ROOT}/public/apply-howto.html"
echo "==> Done. 브라우저 Cmd+Shift+R"
