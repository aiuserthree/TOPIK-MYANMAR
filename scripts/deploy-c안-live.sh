#!/usr/bin/env bash
# C안 FO/BO → 운영 도메인 배포 (Web VPS에서 실행)
# 사용: bash scripts/deploy-c안-live.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
cd "${APP_ROOT}"

echo "==> APP_ROOT=${APP_ROOT}"

echo "==> Build C안 FO → public/"
python3 build.py

echo "==> Build C안 BO → public-bo/"
python3 build-bo.py

echo "==> Python deps"
cd apps/api
if [[ ! -d .venv ]]; then
  python3.11 -m venv .venv || python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

echo "==> systemd (myanmar-api)"
cp "${APP_ROOT}/scripts/systemd/myanmar-api-v2.service" /etc/systemd/system/myanmar-api.service
systemctl daemon-reload
systemctl enable myanmar-api
systemctl restart myanmar-api
systemctl is-active myanmar-api

# uvicorn 워커 startup 은 restart 반환보다 늦으므로 응답할 때까지 대기
health_ok=0
for i in $(seq 1 60); do
  if curl -sf -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    health_ok=1; echo "  /health OK (${i}s)"; break
  fi
  sleep 1
done
[[ ${health_ok} -eq 1 ]] || { echo "ERROR: /health 60s 무응답" >&2; journalctl -u myanmar-api -n 30 --no-pager; exit 1; }

echo "==> nginx (C안 static + /api proxy)"
# 기존 Vite 전용 사이트 비활성화
rm -f /etc/nginx/sites-enabled/myanmar-v2 /etc/nginx/sites-enabled/default 2>/dev/null || true
cp "${APP_ROOT}/scripts/nginx/myanmar-v2.conf" /etc/nginx/sites-available/myanmar-v2.conf
ln -sf /etc/nginx/sites-available/myanmar-v2.conf /etc/nginx/sites-enabled/myanmar-v2.conf
nginx -t
systemctl reload nginx

echo ""
echo "==> 배포 완료. 확인:"
echo "  FO  https://www.topik-myanmar.com/index.html"
echo "  BO  https://admin.topik-myanmar.com/admin.html"
echo "  API curl -s http://127.0.0.1:8000/health"
echo "  API curl -sI https://www.topik-myanmar.com/api/v1/auth/status"
