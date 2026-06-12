#!/usr/bin/env bash
# 수험번호 일괄 부여 대상·제외 사유 진단 (운영/로컬 DB)
#
# Usage:
#   bash scripts/diagnose-exam-assign.sh [exam_round_id]
set -euo pipefail

APP_ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/apps/api/.env}"
ROUND_ID="${1:-}"

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

ROUND_FILTER=""
if [[ -n "${ROUND_ID}" ]]; then
  ROUND_FILTER="AND a.exam_round_id = ${ROUND_ID}"
fi

echo "==> DB: ${DB_URL%%@*}@***"
echo "==> 수험번호 부여 대상 (status=approved + approved_at + exam_number NULL)"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "
SELECT a.id, a.exam_round_id, a.exam_venue_id, v.id AS venue_exists,
       a.exam_level, a.status, a.approved_at, a.payment_status, a.photo_review_status, a.exam_number
FROM applications a
LEFT JOIN exam_venues v ON v.id = a.exam_venue_id
WHERE a.status = 'approved'
  AND a.approved_at IS NOT NULL
  AND a.payment_status = 'paid'
  AND a.photo_review_status = 'approved'
  AND a.exam_number IS NULL
  ${ROUND_FILTER}
ORDER BY a.exam_round_id, a.id;
"

echo ""
echo "==> 시험장 없음으로 채번 불가 (venue_exists NULL)"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "
SELECT COUNT(*) AS blocked_by_missing_venue
FROM applications a
LEFT JOIN exam_venues v ON v.id = a.exam_venue_id
WHERE a.status = 'approved'
  AND a.approved_at IS NOT NULL
  AND a.payment_status = 'paid'
  AND a.photo_review_status = 'approved'
  AND a.exam_number IS NULL
  AND v.id IS NULL
  ${ROUND_FILTER};
"

echo ""
echo "==> 회차별 부여 이력"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "
SELECT id, round_no, title, exam_numbers_assigned_at, exam_number_visible_at
FROM exam_rounds
ORDER BY round_no DESC
LIMIT 10;
"
