#!/usr/bin/env bash
# iOS 입력 포커스 확대 방지 — styles.css + 검색/댓글 페이지
# Mac 로컬: bash scripts/push-input-zoom-fix.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
python3 build.py

echo "==> Push styles.css + all HTML (?v= cache-bust on stylesheet href)"
rsync -avz "${ROOT}/public/assets/styles.css" "${SERVER}:${APP_ROOT}/public/assets/styles.css"
rsync -avz "${ROOT}/public/"*.html "${SERVER}:${APP_ROOT}/public/"

echo "==> Done. 일반 Safari 탭에서도 새 CSS 로드됨 — 홈부터 다시 열어 입력 터치로 확인"
