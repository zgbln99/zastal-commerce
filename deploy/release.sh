#!/usr/bin/env bash
# Zero-surprise release for the AMS host: build in isolation, back up, install, restart, verify, or roll back.
# Usage: deploy/release.sh <git-ref>   (run as the service user on the server)
set -euo pipefail
REF="${1:-release/official-store-handoff-2026-10}"
APP="${ZASTAL_APP_DIR:-/var/lib/sentinelx/uploads/zastal-commerce-app}"
BACKUPS="${ZASTAL_BACKUP_DIR:-/var/lib/sentinelx/backups/zastal}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d /tmp/zastal-release-XXXXXX)"
ORIGIN="${ZASTAL_SITE_ORIGIN:-https://zastalstore.51-15-21-164.sslip.io}"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

log "1/7 kopia zapasowa bazy i mediów"
( cd "$APP" && set -a && . ./.runtime.env && set +a && python3 tools/backup_sqlite.py --out "$BACKUPS" --keep 30 )

log "2/7 pobranie źródeł $REF do $WORK"
git clone --quiet --depth 1 --branch "$REF" https://github.com/zgbln99/zastal-commerce "$WORK/src"

log "3/7 testy backendu na izolowanej bazie"
( cd "$WORK/src" && ZASTAL_TEST_MODE=isolated-only python3 -W ignore -m unittest discover -s tests 2>&1 | tail -3 )

log "4/7 build storefrontu w izolacji"
( cd "$WORK/src/storefront" && npm ci --no-audit --no-fund && npm run build )

log "5/7 instalacja plików (runtime env, baza i media pozostają na miejscu)"
rsync -a --delete \
  --exclude '.runtime.env' --exclude '*.sqlite3*' --exclude 'home_media/' --exclude '.git/' \
  --exclude 'storefront/node_modules/' --exclude '.qa/' \
  "$WORK/src/" "$APP/"
rsync -a --delete "$WORK/src/storefront/node_modules/" "$APP/storefront/node_modules/"
( cd "$APP" && set -a && . ./.runtime.env && set +a && python3 -c "import commerce_api as api; api.init(); print('schema OK')" )

log "6/7 restart usług"
sudo systemctl restart zastal-store-api.service
sleep 2
sudo systemctl restart zastal-storefront.service zastal-store-email.service
sleep 4

log "7/7 weryfikacja"
curl -fsS http://127.0.0.1:8880/health | tee "$WORK/health.json"; echo
curl -fsS -o /dev/null -w 'storefront HTTP %{http_code}\n' http://127.0.0.1:8879/
curl -fsS -o /dev/null -w 'catalog HTTP %{http_code}\n' "$ORIGIN/api/catalog"
log "gotowe: $REF zainstalowane o $STAMP; kopie w $BACKUPS"
log "rollback: git clone poprzedniego taga/commitu i powtórz kroki 4–7; baza: python3 tools/backup_sqlite.py --verify <plik>, potem zatrzymaj API, podmień zastal.sqlite3 i uruchom ponownie"
