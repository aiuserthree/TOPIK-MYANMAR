#!/usr/bin/env bash
# 운영에 아직 없는 패치만 반영 (.env·기존 운영 설정은 건드리지 않음)
# Mac 로컬에서: bash scripts/push-prod-missing.sh
set -euo pipefail

SERVER="${SERVER:-root@115.68.222.58}"
APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Build FO → public/"
cd "${ROOT}"
python3 build.py

echo "==> Push API (S3 IwinV 호환 + 기타 lib)"
rsync -avz \
  "${ROOT}/apps/api/app/lib/storage.py" \
  "${SERVER}:${APP_ROOT}/apps/api/app/lib/"

echo "==> Push DB migrations (V007 소유권 오류 수정 — V008은 IF NOT EXISTS)"
rsync -avz \
  "${ROOT}/db/migrations/V007__pgvector_semantic_search.sql" \
  "${ROOT}/db/migrations/V008__exam_venue_name_my.sql" \
  "${SERVER}:${APP_ROOT}/db/migrations/"

echo "==> Push FO signup (nginx public only)"
rsync -avz \
  "${ROOT}/public/signup.html" \
  "${SERVER}:${APP_ROOT}/public/signup.html"

echo "==> Push ops helper"
rsync -avz \
  "${ROOT}/scripts/test_s3.py" \
  "${ROOT}/scripts/push-prod-missing.sh" \
  "${SERVER}:${APP_ROOT}/scripts/"

cat <<EOF

==> Done (파일 전송). SSH에서 아래만 실행하세요 (.env 수정 불필요 시):

  ssh ${SERVER}
  cd ${APP_ROOT}

  # 마이그레이션 (name_my·V007 — 이미 적용된 항목은 스킵)
  bash scripts/run-migrations.sh

  # API 재시작 (storage.py S3 MissingContentLength 수정 반영)
  systemctl restart myanmar-api
  systemctl is-active myanmar-api
  curl -sf http://127.0.0.1:8000/health

  # S3 스모크 (선택)
  apps/api/.venv/bin/python scripts/test_s3.py

운영 .env 는 sync 대상이 아닙니다. S3 가입 오류가 나면 서버 .env 에만 확인:
  AWS_REQUEST_CHECKSUM_CALCULATION=when_required
  AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

EOF
