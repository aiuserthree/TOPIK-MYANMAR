#!/usr/bin/env bash
# BO 회차관리(KST 날짜·접수상태 자동·UI) + API exam_round_status 운영 반영
# Mac 로컬: bash scripts/push-bo-sessions.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"

echo "==> Build BO → public-bo/"
python3 build-bo.py

echo "==> Push public-bo/ (nginx BO root)"
rsync -avz --delete "${ROOT}/public-bo/" "${SERVER}:${APP_ROOT}/public-bo/"

echo "==> Push API (접수상태 자동 계산)"
rsync -avz \
  "${ROOT}/apps/api/app/lib/exam_round_status.py" \
  "${SERVER}:${APP_ROOT}/apps/api/app/lib/"
rsync -avz \
  "${ROOT}/apps/api/app/routers/admin_api.py" \
  "${ROOT}/apps/api/app/routers/applications.py" \
  "${ROOT}/apps/api/app/routers/exam.py" \
  "${SERVER}:${APP_ROOT}/apps/api/app/routers/"

cat <<EOF

==> 파일 전송 완료. SSH에서 API만 재시작하세요:

  ssh ${SERVER}
  systemctl restart myanmar-api
  systemctl is-active myanmar-api
  curl -sf http://127.0.0.1:8000/health

BO 확인: https://admin.topik-myanmar.com — 회차관리 새로고침(Ctrl+Shift+R)
기존 회차 날짜가 하루 밀려 보이면 회차를 한 번 저장하면 KST 기준으로 맞춰집니다.

EOF
