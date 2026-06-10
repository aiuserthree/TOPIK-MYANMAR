#!/usr/bin/env bash
# FO/BO 정적만 재빌드 (운영 Web VPS — migration/API 재시작 없음)
# git pull 실패·migration 오류 시에도 html/ 소스 기준 public/ 갱신용
# 사용: bash scripts/deploy-static-live.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

echo "==> Build FO → public/"
python3 build.py

echo "==> Build BO → public-bo/"
python3 build-bo.py

echo "==> Verify sample pages"
HTML_COUNT="$(find "${APP_ROOT}/public" -maxdepth 1 -name '*.html' 2>/dev/null | wc -l | tr -d ' ')"
echo "  HTML pages: ${HTML_COUNT} (expect ~25)"
for f in index.html login.html guide-overview.html guide-intro.html rules-fee.html apply-howto.html ticket.html notice.html assets/styles.css assets/common.js; do
  if [[ -f "${APP_ROOT}/public/${f}" ]]; then
    echo "  ok ${f} ($(wc -c < "${APP_ROOT}/public/${f}") bytes)"
  else
    echo "  MISSING ${f}" >&2
  fi
done

echo "==> Static deploy complete (nginx reload 불필요)"
