#!/usr/bin/env bash
# 가입 미완료(구글 연동만 등) 회원의 member_access_logs 정리
# Web VPS 또는 DATABASE_URL_SYNC 지정 환경에서 실행
#
# Usage:
#   bash scripts/cleanup-pending-member-access-logs.sh          # dry-run (건수만)
#   CONFIRM_DELETE=1 bash scripts/cleanup-pending-member-access-logs.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/apps/api/.env}"

if [[ -z "${DATABASE_URL_SYNC:-}" && -f "${ENV_FILE}" ]]; then
  _raw="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [[ -n "${_raw}" ]]; then
    DATABASE_URL_SYNC="$(printf '%s' "${_raw}" | sed 's|^postgresql+asyncpg://|postgresql://|')"
  fi
fi

DB_URL="${DATABASE_URL_SYNC:-postgresql://topik_app@127.0.0.1:5432/topik_myanmar}"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found." >&2
  exit 1
fi

SQL_COUNT=$(cat <<'EOSQL'
SELECT COUNT(*) AS pending_logs
FROM member_access_logs mal
WHERE mal.memo = 'google_register'
   OR (
     mal.user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM users u
       WHERE u.id = mal.user_id
         AND (
           u.status = 'pending'
           OR u.birth_date = '00000000'
           OR u.photo_file_id IS NULL
           OR COALESCE(TRIM(u.phone), '') = ''
         )
     )
   );
EOSQL
)

SQL_DELETE=$(cat <<'EOSQL'
DELETE FROM member_access_logs mal
WHERE mal.memo = 'google_register'
   OR (
     mal.user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM users u
       WHERE u.id = mal.user_id
         AND (
           u.status = 'pending'
           OR u.birth_date = '00000000'
           OR u.photo_file_id IS NULL
           OR COALESCE(TRIM(u.phone), '') = ''
         )
     )
   );
EOSQL
)

echo "==> 대상 DB: ${DB_URL%%@*}@***"
echo "==> 삭제 대상 건수 (가입 미완료·google_register):"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_COUNT}"

if [[ "${CONFIRM_DELETE:-}" != "1" ]]; then
  echo ""
  echo "실제 삭제: CONFIRM_DELETE=1 bash scripts/cleanup-pending-member-access-logs.sh"
  exit 0
fi

echo "==> 삭제 실행..."
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_DELETE}"
echo "==> 완료"
