#!/usr/bin/env bash
# FO 메인 index.html (BO 회차 일정 연동) 운영 반영
# Mac 로컬: bash scripts/push-index.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
python3 build.py

echo "==> Push public/index.html → ${SERVER}"
rsync -avz "${ROOT}/public/index.html" "${SERVER}:${APP_ROOT}/public/index.html"

echo "==> Done. https://www.topik-myanmar.com/ — Ctrl+Shift+R 로 확인"
