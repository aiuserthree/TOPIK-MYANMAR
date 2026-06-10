#!/usr/bin/env bash
# Apply db/migrations/*.sql to PostgreSQL (idempotent CREATE IF NOT EXISTS / ALTER IF NOT EXISTS).
# Run on the Web VPS after sync, or locally against a dev DB.
#
# Usage:
#   bash scripts/run-migrations.sh
#   DATABASE_URL_SYNC='postgresql://user:pass@host:5432/topik_myanmar' bash scripts/run-migrations.sh
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
  echo "ERROR: psql not found. Install postgresql-client." >&2
  exit 1
fi

echo "==> DB migrations → ${DB_URL%%@*}@***"
for f in "${APP_ROOT}"/db/migrations/V*.sql; do
  [[ -f "$f" ]] || continue
  echo "  applying $(basename "$f")"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "$f"
done

if [[ -f "${APP_ROOT}/db/seed/prod_seed.sql" ]]; then
  echo "  applying prod_seed.sql"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${APP_ROOT}/db/seed/prod_seed.sql" || true
fi

echo "==> Migrations complete"
