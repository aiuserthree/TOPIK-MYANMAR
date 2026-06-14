#!/usr/bin/env bash
# 접수자·회원·접근로그·권한변경이력·처리이력 데이터 초기화
#
# 대상:
#   - 접수자 목록 (applications, application_submissions, application_memos, application_drafts)
#   - 회원 관리 (users — FO 회원 전체)
#   - 관리자 접근 로그 (admin_access_logs)
#   - 회원 접근 로그 (member_access_logs)
#   - 권한 변경 이력 + 처리 이력 (admin_audit_logs)
#
# 유지: admin_users, exam_rounds/venues, notices, FAQ, terms, board_posts(회원 삭제 시 CASCADE로 함께 삭제됨)
#
# Usage:
#   bash scripts/reset-prod-member-audit-data.sh                    # dry-run (건수만)
#   CONFIRM_DELETE=1 bash scripts/reset-prod-member-audit-data.sh   # 실제 삭제
#
# 운영 서버:
#   cd /opt/myanmar-v2
#   CONFIRM_DELETE=1 bash scripts/reset-prod-member-audit-data.sh
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

SQL_SUMMARY=$(cat <<'EOSQL'
SELECT 'applications' AS tbl, COUNT(*) FROM applications
UNION ALL SELECT 'application_submissions', COUNT(*) FROM application_submissions
UNION ALL SELECT 'application_memos', COUNT(*) FROM application_memos
UNION ALL SELECT 'application_drafts', COUNT(*) FROM application_drafts
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'board_posts', COUNT(*) FROM board_posts
UNION ALL SELECT 'terms_consents', COUNT(*) FROM terms_consents
UNION ALL SELECT 'member_access_logs', COUNT(*) FROM member_access_logs
UNION ALL SELECT 'admin_access_logs', COUNT(*) FROM admin_access_logs
UNION ALL SELECT 'admin_audit_logs', COUNT(*) FROM admin_audit_logs
UNION ALL SELECT 'user_photo_files', COUNT(*) FROM file_attachments WHERE owner_type = 'user_photo'
UNION ALL SELECT 'application_photo_files', COUNT(*) FROM file_attachments WHERE owner_type = 'application_photo'
ORDER BY tbl;
EOSQL
)

SQL_DELETE=$(cat <<'EOSQL'
BEGIN;

-- 사진 FK 해제 후 첨부 메타 삭제
UPDATE users SET photo_file_id = NULL WHERE photo_file_id IS NOT NULL;
UPDATE applications SET photo_file_id = NULL WHERE photo_file_id IS NOT NULL;

DELETE FROM file_attachments
WHERE owner_type IN ('user_photo', 'application_photo');

-- 접수 데이터
DELETE FROM application_memos;
DELETE FROM applications;
DELETE FROM application_submissions;
DELETE FROM application_drafts;

-- 회원 관련 부가 데이터
DELETE FROM email_outbox WHERE user_id IS NOT NULL;
DELETE FROM email_verification_codes;
DELETE FROM password_reset_tokens;

-- 접근·감사 로그
DELETE FROM member_access_logs;
DELETE FROM admin_access_logs;
DELETE FROM admin_audit_logs;

-- FO 회원 (board_posts, terms_consents 등 CASCADE)
DELETE FROM users;

-- 회차 수험번호 부여·노출 메타 초기화
UPDATE exam_rounds
SET exam_numbers_assigned_at = NULL,
    exam_number_visible_at = NULL;

COMMIT;
EOSQL
)

echo "==> 대상 DB: ${DB_URL%%@*}@***"
echo "==> 삭제 예정 건수:"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_SUMMARY}"

if [[ "${CONFIRM_DELETE:-}" != "1" ]]; then
  echo ""
  echo "실제 삭제: CONFIRM_DELETE=1 bash scripts/reset-prod-member-audit-data.sh"
  exit 0
fi

echo "==> 삭제 실행..."
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_DELETE}"
echo "==> 삭제 후 건수:"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_SUMMARY}"
echo "==> 완료"
