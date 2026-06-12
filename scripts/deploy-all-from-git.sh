#!/usr/bin/env bash
# GitHub origin/main → 운영 전체 반영 (API + BO + FO + migration)
# Web VPS: bash scripts/deploy-all-from-git.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

echo "==> Fetch origin/main"
git fetch origin
echo "  target commit: $(git rev-parse --short origin/main) $(git log origin/main -1 --format='%s')"

echo "==> Checkout latest code (API + BO + FO + db + scripts)"
git checkout origin/main -- \
  apps/api/app/ \
  apps/api/requirements.txt \
  "html/C안/BO(admin)/" \
  "html/C안/FO/" \
  html/shared/ \
  db/migrations/ \
  build.py \
  build-bo.py \
  scripts/

echo "==> DB migrations (V009/V010 등)"
bash scripts/run-migrations.sh || echo "WARN: migration step had errors — continuing"

echo "==> Python deps + API restart"
cd apps/api
if [[ ! -d .venv ]]; then
  python3.11 -m venv .venv || python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
cd "${APP_ROOT}"

cp scripts/systemd/myanmar-api-v2.service /etc/systemd/system/myanmar-api.service
systemctl daemon-reload
systemctl restart myanmar-api
sleep 2
systemctl is-active myanmar-api || { echo "ERROR: myanmar-api not running" >&2; exit 1; }
curl -sf http://127.0.0.1:8000/health || echo "WARN: /health check failed — continuing build"

echo "==> Build FO + BO static (필수 — nginx는 public/ public-bo/ 만 서빙)"
python3 build.py
python3 build-bo.py

echo "==> Verify"
echo "  deployed commit: $(git rev-parse --short origin/main)"
echo "  FO pages: $(find public -maxdepth 1 -name '*.html' | wc -l | tr -d ' ')"
echo "  BO admin: $(test -f public-bo/admin.html && echo ok || echo MISSING)"
grep -q "처리 사유" public-bo/panels/audit.jsx && echo "  audit.jsx: 처리 사유 OK" || echo "  audit.jsx: OLD"
grep -q "memo" apps/api/app/routers/admin_api.py && echo "  admin_api: memo OK"
grep -q "boardNotifyOptIn" public-bo/panels/admins.jsx && echo "  admins.jsx: 게시글 알림 OK" || echo "  admins.jsx: OLD (board notify missing)"
grep -q "reloadBoardBadges" public-bo/assets/app.jsx && echo "  app.jsx: board badge poll OK" || echo "  app.jsx: OLD (board badge poll missing)"
grep -q "board_notify_opt_in" apps/api/app/routers/admin_api.py && echo "  admin_api: board_notify_opt_in OK" || echo "  admin_api: OLD (board notify missing)"
test -f public-bo/shared/bo-admin-ko.js && grep -q "TOPIKBoAdminKo" public-bo/shared/bo-admin-ko.js && \
  echo "  bo-admin-ko.js: OK" || echo "  bo-admin-ko.js: MISSING (BO 상세/연명부 한글 표시 미반영)"
grep -q "boAdminNationKo" public-bo/panels/applicants.jsx && \
  echo "  applicants.jsx detail ko: OK" || echo "  applicants.jsx detail ko: MISSING"
test -f apps/api/app/lib/profile_ko_labels.py && grep -q "nationality_ko" apps/api/app/lib/roster_export.py && \
  echo "  roster_export API ko: OK" || echo "  roster_export API ko: MISSING"
grep -q '_sends_user_submission_email' apps/api/app/lib/email_notify.py && \
grep -q '문의 게시판' apps/api/app/lib/email_notify.py && \
echo "  email_notify: inquiry board labels OK" || echo "  email_notify: OLD (inquiry email/labels missing)"
grep -q '작성·수정 모두 필수' public/assets/fo-board.js && \
echo "  fo-board.js: edit password validation OK" || echo "  fo-board.js: OLD (edit password validation missing)"
! grep -q 'if (editingPostId) return' public/refund-correction.html && \
echo "  refund-correction.html: edit agree validation OK" || echo "  refund-correction.html: OLD (edit agree skip present)"
test -f db/migrations/V015__admin_board_notify_opt_in.sql && echo "  migration V015: present" || echo "  migration V015: MISSING"
if command -v psql >/dev/null 2>&1; then
  _env="${APP_ROOT}/apps/api/.env"
  if [[ -z "${DATABASE_URL_SYNC:-}" && -f "${_env}" ]]; then
    _raw="$(grep -E '^DATABASE_URL=' "${_env}" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
    [[ -n "${_raw}" ]] && DATABASE_URL_SYNC="$(printf '%s' "${_raw}" | sed 's|^postgresql+asyncpg://|postgresql://|')"
  fi
  _db="${DATABASE_URL_SYNC:-postgresql://topik_app@127.0.0.1:5432/topik_myanmar}"
  _col="$(psql "${_db}" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='board_notify_opt_in'" 2>/dev/null || true)"
  [[ "${_col}" == "1" ]] && echo "  DB column board_notify_opt_in: OK" || echo "  DB column board_notify_opt_in: MISSING"
fi
echo "  API started: $(systemctl show myanmar-api -p ActiveEnterTimestamp --value 2>/dev/null || echo unknown)"

echo ""
echo "==> Done. 확인:"
echo "  https://admin.topik-myanmar.com → 처리 이력 상세 → 처리 사유"
echo "  https://www.topik-myanmar.com"
