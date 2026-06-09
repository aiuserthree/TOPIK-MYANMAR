#!/usr/bin/env bash
# iOS 입력 포커스 확대 방지 — styles.css + 검색/댓글 페이지
# Mac 로컬: bash scripts/push-input-zoom-fix.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
python3 build.py

echo "==> Push styles.css + board/search pages"
rsync -avz "${ROOT}/public/assets/styles.css" "${SERVER}:${APP_ROOT}/public/assets/styles.css"
rsync -avz \
  "${ROOT}/public/faq.html" \
  "${ROOT}/public/notice.html" \
  "${ROOT}/public/qna.html" \
  "${ROOT}/public/refund-correction.html" \
  "${SERVER}:${APP_ROOT}/public/"

echo "==> Done. iPhone Safari에서 로그인/회원가입 입력 터치 후 확대 여부 확인 (캐시: 시크릿 탭 또는 Ctrl+Shift+R)"
