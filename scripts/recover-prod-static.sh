#!/usr/bin/env bash
# 운영 FO/BO 정적 긴급 복구 — html/C안/FO 전체 checkout 후 재빌드
# (일부 파일만 checkout + build.py 하면 index/login 등 대부분 페이지 500)
# Web VPS: bash scripts/recover-prod-static.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

echo "==> Fetch latest from GitHub"
git fetch origin

echo "==> Restore full FO source + build scripts from origin/main"
git checkout origin/main -- \
  "html/C안/FO/" \
  "html/shared/" \
  build.py \
  build-bo.py \
  scripts/deploy-static-live.sh \
  scripts/deploy-live.sh \
  scripts/recover-prod-static.sh

echo "==> Rebuild static"
python3 build.py
python3 build-bo.py

echo "==> Verify"
HTML_COUNT="$(find "${APP_ROOT}/public" -maxdepth 1 -name '*.html' | wc -l | tr -d ' ')"
echo "  HTML pages in public/: ${HTML_COUNT} (expect ~25)"
for f in index.html login.html assets/styles.css assets/common.js notice.html; do
  if [[ -f "${APP_ROOT}/public/${f}" ]]; then
    echo "  ok public/${f} ($(wc -c < "${APP_ROOT}/public/${f}") bytes)"
  else
    echo "  MISSING public/${f}" >&2
    exit 1
  fi
done

echo ""
echo "==> Recovery complete. 브라우저 Cmd+Shift+R 후 확인:"
echo "  https://www.topik-myanmar.com/index.html"
echo "  https://www.topik-myanmar.com/login.html"
