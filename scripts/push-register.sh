#!/usr/bin/env bash
# 시험접수 register.html 패치만 운영 반영 (예정 회차 카드 표시)
# Mac 로컬: bash scripts/push-register.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT}"
python3 build.py

echo "==> Push public/register.html → ${SERVER} (nginx FO root)"
rsync -avz "${ROOT}/public/register.html" "${SERVER}:${APP_ROOT}/public/register.html"

echo "==> Done. https://www.topik-myanmar.com/register.html — Ctrl+Shift+R 로 확인"
