#!/usr/bin/env bash
# 메일 즉시발송(API) + 댓글 i18n(FO) 운영 반영 — Mac 로컬에서 실행
# 사용: bash scripts/push-production-patch.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Build FO → public/ (로컬)"
cd "${ROOT}"
python3 build.py

echo "==> Push API patch → ${SERVER}:${APP_ROOT}/apps/api"
rsync -avz "${ROOT}/apps/api/app/lib/mail.py" "${SERVER}:${APP_ROOT}/apps/api/app/lib/"
rsync -avz "${ROOT}/apps/api/app/lib/email_worker.py" "${SERVER}:${APP_ROOT}/apps/api/app/lib/"
rsync -avz "${ROOT}/apps/api/app/routers/auth.py" "${SERVER}:${APP_ROOT}/apps/api/app/routers/"
rsync -avz "${ROOT}/apps/api/app/routers/health.py" "${SERVER}:${APP_ROOT}/apps/api/app/routers/"

echo "==> Push FO static → ${SERVER}:${APP_ROOT}/public (nginx root, 한글 경로 회피)"
rsync -avz "${ROOT}/public/assets/fo-board.js" "${SERVER}:${APP_ROOT}/public/assets/"
rsync -avz "${ROOT}/public/qna.html" "${ROOT}/public/refund-correction.html" "${SERVER}:${APP_ROOT}/public/"

echo "==> Done. SSH에서:"
echo "  systemctl restart myanmar-api"
echo ""
echo "Google 간편가입 — 서버 .env에 GOOGLE_CLIENT_ID 없으면:"
echo "  grep GOOGLE_CLIENT_ID ${APP_ROOT}/apps/api/.env"
echo "  # 없으면 추가 후 systemctl restart myanmar-api"
