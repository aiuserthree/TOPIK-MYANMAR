#!/usr/bin/env bash
# 회원가입 signup.html 패치만 운영 반영 (S3·API·DB·.env 건드리지 않음)
# Mac 로컬: bash scripts/push-signup-i18n.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
python3 build.py

echo "==> Push public/signup.html → ${SERVER} (nginx root — 한글 경로 html/C안 은 운영 미사용)"
rsync -avz "${ROOT}/public/signup.html" "${SERVER}:${APP_ROOT}/public/signup.html"

echo "==> Done. nginx 재시작 불필요 — 브라우저에서 signup.html 새로고침(Ctrl+Shift+R)으로 확인"
