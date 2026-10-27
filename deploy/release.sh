#!/usr/bin/env bash
# Zero-surprise release for the AMS host: build in isolation, back up, install, restart, verify, or roll back.
# Usage: deploy/release.sh <git-ref>   (run as the service user on the server)
set -euo pipefail
REF="${1:-release/official-store-handoff-2026-10}"
APP="${ZASTAL_APP_DIR:-/var/lib/sentinelx/uploads/zastal-commerce-app}"
BACKUPS="${ZASTAL_BACKUP_DIR:-/var/lib/sentinelx/backups/zastal}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SERVICE_USER="${ZASTAL_SERVICE_USER:-$(systemctl show -p User --value zastal-store-api.service 2>/dev/null || true)}"
SERVICE_USER="${SERVICE_USER:-sentinelx}"
# Never install as root: rsync -a would give the app directory and new files to root, and the API (which runs as the
# service user) could then read its database but not write to it ("attempt to write a readonly database").
if [ "$(id -u)" -eq 0 ]; then
  echo "Uruchomiono jako root: przełączam na użytkownika usługi $SERVICE_USER (prawa własności bazy i katalogu muszą zostać po stronie usługi)."
  exec runuser -u "$SERVICE_USER" -- "$0" "$@"
fi
WORK="$(mktemp -d /tmp/zastal-release-XXXXXX)"
ORIGIN="${ZASTAL_SITE_ORIGIN:-https://zastalstore.51-15-21-164.sslip.io}"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# The work directory holds a full clone and node_modules (about a gigabyte): always remove it, and sweep leftovers of
# earlier runs, otherwise repeated releases fill the disk and SQLite starts refusing writes ("Błąd zapisu danych").
trap 'rm -rf "$WORK"' EXIT
find /tmp -maxdepth 1 -name 'zastal-release-*' -mmin +30 -exec rm -rf {} + 2>/dev/null || true
NEED_MB="${ZASTAL_RELEASE_MIN_FREE_MB:-3000}"
for place in "$APP" /tmp "$BACKUPS"; do
  [ -d "$place" ] || continue
  free_mb="$(df -Pm "$place" | awk 'NR==2 {print $4}')"
  if [ "${free_mb:-0}" -lt "$NEED_MB" ]; then
    log "PRZERWANO: za mało miejsca na dysku ($place: ${free_mb} MB wolnego, potrzeba ${NEED_MB} MB). Zwolnij miejsce (stare kopie, /tmp/zastal-release-*, ~/.npm/_cacache) i uruchom ponownie."
    exit 1
  fi
done

[ -r "$APP/.runtime.env" ] || { log "BŁĄD: $(id -un) nie może odczytać $APP/.runtime.env (właściciel $SERVICE_USER, tryb 600). Napraw: sudo bash tools/fix_permissions.sh"; exit 1; }

log "1/7 kopia zapasowa bazy i mediów"
( cd "$APP" && set -a && . ./.runtime.env && set +a && python3 tools/backup_sqlite.py --out "$BACKUPS" --keep 30 )

log "2/7 pobranie źródeł $REF do $WORK"
git clone --quiet --depth 1 --branch "$REF" https://github.com/zgbln99/zastal-commerce "$WORK/src"

log "3/7 testy backendu na izolowanej bazie"
( cd "$WORK/src" && ZASTAL_TEST_MODE=isolated-only python3 -W ignore -m unittest discover -s tests 2>&1 | tail -3 )

log "4/7 build storefrontu w izolacji"
( cd "$WORK/src/storefront" && npm ci --no-audit --no-fund && npm run build )

log "5/7 instalacja plików (runtime env, baza i media pozostają na miejscu)"
# Owner, group and permission bits are not copied: the directory and the files stay what the service user made them.
RSYNC_FLAGS=(-a --no-owner --no-group --no-perms --executability --chmod=Du+rwx,Dgo+rx,Fu+rw,Fgo+r)
rsync "${RSYNC_FLAGS[@]}" --delete \
  --exclude '.runtime.env' --exclude '*.sqlite3*' --exclude 'home_media/' --exclude '.git/' \
  --exclude 'storefront/node_modules/' --exclude '.qa/' \
  "$WORK/src/" "$APP/"
rsync "${RSYNC_FLAGS[@]}" --delete "$WORK/src/storefront/node_modules/" "$APP/storefront/node_modules/"
for target in "$APP" "$APP"/*.sqlite3*; do
  [ -e "$target" ] || continue
  if [ ! -w "$target" ]; then log "BŁĄD: $target nie jest zapisywalny dla $(id -un); API nie zapisze bazy. Napraw: sudo bash tools/fix_permissions.sh"; exit 1; fi
done
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
