#!/usr/bin/env bash
# 환불·정보정정(refund_correction) + 문의(inquiry) 게시판 데이터 초기화
#
# Usage:
#   bash scripts/reset-board-data.sh                    # dry-run (건수만)
#   CONFIRM_DELETE=1 bash scripts/reset-board-data.sh   # 실제 삭제
#
# 운영 서버 (SSH 후):
#   cd /opt/myanmar-v2
#   CONFIRM_DELETE=1 bash scripts/reset-board-data.sh
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

BOARD_TYPES="'refund_correction','inquiry','refund-correction'"

SQL_SUMMARY=$(cat <<EOSQL
SELECT board_type, COUNT(*) AS posts
FROM board_posts
WHERE board_type IN (${BOARD_TYPES})
GROUP BY board_type
ORDER BY board_type;

SELECT COUNT(*) AS comments
FROM board_comments c
JOIN board_posts p ON p.id = c.board_post_id
WHERE p.board_type IN (${BOARD_TYPES});

SELECT COUNT(*) AS attachments
FROM file_attachments f
WHERE f.owner_type = 'board_post'
  AND f.owner_id IN (
    SELECT id FROM board_posts WHERE board_type IN (${BOARD_TYPES})
  );

EOSQL
)

SQL_DELETE=$(cat <<'EOSQL'
BEGIN;

-- semantic search chunks (테이블 있을 때만)
DO $sem$
BEGIN
  IF to_regclass('public.semantic_chunks') IS NOT NULL THEN
    DELETE FROM semantic_chunks s
    WHERE s.source_type = 'board_post'
      AND s.source_id IN (
        SELECT id FROM board_posts
        WHERE board_type IN ('refund_correction', 'inquiry', 'refund-correction')
      );
  END IF;
END
$sem$;

-- 첨부파일 메타 (실제 S3 객체는 별도 — DB 목록만 비움)
DELETE FROM file_attachments f
WHERE f.owner_type = 'board_post'
  AND f.owner_id IN (
    SELECT id FROM board_posts
    WHERE board_type IN ('refund_correction', 'inquiry', 'refund-correction')
  );

-- 댓글은 board_posts CASCADE, 게시글 삭제로 함께 제거
DELETE FROM board_posts
WHERE board_type IN ('refund_correction', 'inquiry', 'refund-correction');

COMMIT;
EOSQL
)

echo "==> 대상 DB: ${DB_URL%%@*}@***"
echo "==> 삭제 대상 (환불·정보정정 + 문의):"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_SUMMARY}"

if [[ "${CONFIRM_DELETE:-}" != "1" ]]; then
  echo ""
  echo "실제 삭제: CONFIRM_DELETE=1 bash scripts/reset-board-data.sh"
  exit 0
fi

echo "==> 삭제 실행..."
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c "${SQL_DELETE}"
echo "==> 완료 — 게시글·댓글·첨부 메타·semantic_chunks 제거됨"
