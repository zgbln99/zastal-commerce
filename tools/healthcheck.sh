#!/usr/bin/env bash
# Uptime probe for cron/monitoring: exit 0 only when API and storefront answer and the API reports ok.
# Usage: tools/healthcheck.sh [origin]   (default https://zastalstore.51-15-21-164.sslip.io)
set -u
ORIGIN="${1:-${ZASTAL_SITE_ORIGIN:-https://zastalstore.51-15-21-164.sslip.io}}"
API="$(curl -fsS -m 10 "$ORIGIN/api/catalog" -o /dev/null -w '%{http_code}' || echo 000)"
HEALTH="$(curl -fsS -m 10 http://127.0.0.1:8880/health 2>/dev/null || echo '{}')"
WEB="$(curl -fsS -m 10 "$ORIGIN/" -o /dev/null -w '%{http_code}' || echo 000)"
OK="$(printf '%s' "$HEALTH" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ok" if d.get("ok") else "fail")' 2>/dev/null || echo fail)"
printf 'api=%s web=%s health=%s %s\n' "$API" "$WEB" "$OK" "$HEALTH"
[ "$API" = 200 ] && [ "$WEB" = 200 ] && [ "$OK" = ok ]
