#!/usr/bin/env bash
# 로컬 Mac → 운영 서버 코드 동기화 (로컬에서 실행)
# 사용: bash scripts/sync-to-server.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Sync ${ROOT} → ${SERVER}:${APP_ROOT}"

rsync -avz --delete \
  --exclude '.git' \
  --exclude 'apps/api/.venv' \
  --exclude 'apps/api/var' \
  --exclude 'node_modules' \
  --exclude 'apps/web/node_modules' \
  --exclude '.env' \
  "${ROOT}/html/" "${SERVER}:${APP_ROOT}/html/"

rsync -avz \
  --exclude '.venv' \
  --exclude 'var' \
  --exclude '.env' \
  "${ROOT}/apps/api/" "${SERVER}:${APP_ROOT}/apps/api/"

rsync -avz \
  "${ROOT}/build.py" "${ROOT}/build-bo.py" \
  "${ROOT}/scripts/" \
  "${ROOT}/db/" \
  "${SERVER}:${APP_ROOT}/"

# 이미 로컬에서 빌드한 산출물도 함께 전송 (서버에서 재빌드해도 되지만 빠른 반영용)
if [[ -d "${ROOT}/public" ]]; then
  rsync -avz --delete "${ROOT}/public/" "${SERVER}:${APP_ROOT}/public/"
fi
if [[ -d "${ROOT}/public-bo" ]]; then
  rsync -avz --delete "${ROOT}/public-bo/" "${SERVER}:${APP_ROOT}/public-bo/"
fi

echo "==> Done. SSH 접속 후 배포 실행:"
echo "  ssh ${SERVER}"
echo "  cd ${APP_ROOT} && bash scripts/deploy-live.sh"
