#!/usr/bin/env bash
# 운영 서버(/opt/myanmar-v2)에서 1회 실행 — sync-to-server.sh 구버전이 scripts/·db/를 루트에 펼쳐 넣은 경우 복구
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

mkdir -p scripts db

for f in deploy-live.sh run-migrations.sh sync-to-server.sh deploy-c안-live.sh deploy-iwinv.sh \
  fix-nginx-open-access.sh push-fo-parity.sh push-production-patch.sh push-profile-signup-guard.sh; do
  if [[ -f "${APP_ROOT}/${f}" && ! -f "${APP_ROOT}/scripts/${f}" ]]; then
    mv "${APP_ROOT}/${f}" "${APP_ROOT}/scripts/${f}"
  fi
done

if [[ -d "${APP_ROOT}/systemd" && ! -d "${APP_ROOT}/scripts/systemd" ]]; then
  mv "${APP_ROOT}/systemd" "${APP_ROOT}/scripts/systemd"
fi
if [[ -d "${APP_ROOT}/nginx" && ! -d "${APP_ROOT}/scripts/nginx" ]]; then
  mv "${APP_ROOT}/nginx" "${APP_ROOT}/scripts/nginx"
fi
if [[ -d "${APP_ROOT}/migrations" && ! -d "${APP_ROOT}/db/migrations" ]]; then
  mkdir -p "${APP_ROOT}/db"
  mv "${APP_ROOT}/migrations" "${APP_ROOT}/db/migrations"
fi
if [[ -d "${APP_ROOT}/seed" && ! -d "${APP_ROOT}/db/seed" ]]; then
  mkdir -p "${APP_ROOT}/db"
  mv "${APP_ROOT}/seed" "${APP_ROOT}/db/seed"
fi

echo "==> Layout OK. deploy:"
echo "  cd ${APP_ROOT} && bash scripts/deploy-live.sh"
