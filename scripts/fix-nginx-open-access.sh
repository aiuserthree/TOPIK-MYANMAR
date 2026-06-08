#!/usr/bin/env bash
# 운영 서버 nginx IP 제한 즉시 제거 (Web VPS root 실행)
# 기존 nginx 설정은 유지하고 allow/deny·include 만 제거합니다.
set -euo pipefail

SITE="/etc/nginx/sites-available/myanmar-v2.conf"
ENABLED="/etc/nginx/sites-enabled/myanmar-v2.conf"

echo "==> Remove IP whitelist rules (keep existing SSL/server blocks)"

for f in "$SITE" "$ENABLED" /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*; do
  [[ -f "$f" ]] || continue
  sed -i \
    -e '/topik-allowed-ips/d' \
    -e '/topik-bo-allowed-ips/d' \
    -e '/^[[:space:]]*allow[[:space:]]/d' \
    -e '/^[[:space:]]*deny[[:space:]]/d' \
    "$f"
done

rm -f /etc/nginx/conf.d/topik-allowed-ips.conf /etc/nginx/conf.d/topik-bo-allowed-ips.conf

# certbot 다중 도메인 발급 시 BO도 www 인증서 경로를 쓰는 경우가 많음
if [[ -f "$SITE" ]]; then
  sed -i 's|/etc/letsencrypt/live/admin.topik-myanmar.com/|/etc/letsencrypt/live/www.topik-myanmar.com/|g' "$SITE"
fi

ENV_FILE="/opt/myanmar-v2/apps/api/.env"
if [[ -f "$ENV_FILE" ]]; then
  sed -i '/^ALLOWED_IPS=/d; /^BO_ALLOWED_IPS=/d' "$ENV_FILE"
  systemctl restart myanmar-api || true
fi

echo "==> Available certs:"
ls -1 /etc/letsencrypt/live/ 2>/dev/null || true

nginx -t
systemctl reload nginx

echo "==> Test"
curl -sS -o /dev/null -w "  FO www: %{http_code}\n" https://www.topik-myanmar.com/
curl -sS -o /dev/null -w "  BO admin: %{http_code}\n" https://admin.topik-myanmar.com/
