#!/usr/bin/env bash
# Repairs file ownership after a release that was run as root (symptom: "attempt to write a readonly database").
# The API runs as the service user and must own its directory, the SQLite files, the media and the build output.
# Usage: sudo bash tools/fix_permissions.sh        (ZASTAL_APP_DIR, ZASTAL_SERVICE_USER override the defaults)
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Uruchom jako root: sudo bash tools/fix_permissions.sh" >&2; exit 1; }
APP="${ZASTAL_APP_DIR:-/var/lib/sentinelx/uploads/zastal-commerce-app}"
SERVICE_USER="${ZASTAL_SERVICE_USER:-$(systemctl show -p User --value zastal-store-api.service 2>/dev/null || true)}"
SERVICE_USER="${SERVICE_USER:-sentinelx}"
[ -d "$APP" ] || { echo "Brak katalogu $APP" >&2; exit 1; }
id "$SERVICE_USER" >/dev/null

echo "Zatrzymuję usługi, żeby nikt nie trzymał bazy podczas poprawek"
systemctl stop zastal-store-api.service zastal-store-email.service zastal-storefront.service 2>/dev/null || true

echo "Przed: $(stat -c '%U:%G %a' "$APP") $APP"
ls -la "$APP"/*.sqlite3* 2>/dev/null || true
chown -R "$SERVICE_USER": "$APP"
chmod u+rwx "$APP"
echo "Po:    $(stat -c '%U:%G %a' "$APP") $APP"
ls -la "$APP"/*.sqlite3* 2>/dev/null || true

echo "Uruchamiam usługi"
systemctl start zastal-store-api.service
sleep 2
systemctl start zastal-storefront.service zastal-store-email.service 2>/dev/null || true
sleep 3
curl -fsS -m 10 http://127.0.0.1:8880/health && echo
