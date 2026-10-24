# Zastal Store — runbook wdrożenia i uruchomienia sprzedaży

Dotyczy serwera AMS (`zastal-store-api.service`, `zastal-storefront.service`, `zastal-store-email.service`, Nginx).
Wszystkie kroki wykonuje osoba z dostępem do serwera. Żaden krok nie kasuje bazy ani mediów.

## 0. Przed pierwszym wdrożeniem tej wersji

1. Zrób kopię zapasową na serwerze i sprawdź ją:
   ```bash
   cd /var/lib/sentinelx/uploads/zastal-commerce-app
   set -a; . ./.runtime.env; set +a
   python3 tools/backup_sqlite.py --out /var/lib/sentinelx/backups/zastal --keep 30
   python3 tools/backup_sqlite.py --verify /var/lib/sentinelx/backups/zastal/<najnowszy>.sqlite3
   ```
   `--verify` przywraca kopię do katalogu tymczasowego, uruchamia `integrity_check`
   i migracje schematu — to jest test przywrócenia.
2. Porównaj aktywne wdrożenie z repozytorium: `git -C <katalog aplikacji> status`, `git log -1`,
   `systemctl status zastal-store-api zastal-storefront zastal-store-email`, `journalctl -u zastal-store-api -n 200`.
   Niezacommitowane zmiany na serwerze zachowaj w gałęzi przed nadpisaniem (`git stash` / commit).
3. Uzupełnij `.runtime.env` według `.env.example` (nowe klucze: `ZASTAL_SALES_MODE`, `ZASTAL_PAYU_*`,
   opcjonalnie `ZASTAL_ALLOWED_ORIGINS` dla stagingu). Plik pozostaje poza Git, `chmod 600`.

## 1. Migracje schematu

`python3 -c "import commerce_api as api; api.init()"` uruchamia wyłącznie migracje addytywne:

| Migracja | Co robi | Dane |
| --- | --- | --- |
| `users` (role personelu) | przebudowa tabeli z nowym CHECK ról; id, hasła, sesje zachowane | bez utraty |
| `email_outbox` | `user_id` może być NULL, dodana kolumna `recipient` (zamówienia gości) | bez utraty |
| `pos_sales` | przebudowa: `demo` 0/1, zmiana, rabat, dokument fiskalny, gotówka | bez utraty |
| `product_options` | nowe kolumny: metoda znakowania, przedsprzedaż, rozmiarówka, układ nadruku | ALTER TABLE |
| nowe tabele | `store_settings`, `shipping_methods`, `order_details`, `payments`, `payment_notifications`, `payment_refunds`, `pos_shifts`, `returns` | tworzone puste |

Migracje są idempotentne (testy `test_staff`, `test_sales` uruchamiają `init()` dwukrotnie i na starym schemacie).

## 2. Wydanie

`deploy/release.sh <gałąź lub tag>` wykonuje: backup → clone → testy backendu → build Next w izolacji →
rsync bez `.runtime.env`, bazy i `home_media/` → `api.init()` → restart usług → `/health`, storefront, katalog.
Jednostki systemd w `deploy/` (API, storefront, worker e-mail, timer utrzymania co 30 min, nocny backup 03:20)
instaluje się przez `sudo cp deploy/*.service deploy/*.timer /etc/systemd/system/ && sudo systemctl daemon-reload &&
sudo systemctl enable --now zastal-store-maintenance.timer zastal-store-backup.timer`.
Konfiguracja Nginx: `deploy/nginx-zastalstore.conf` (HSTS, osobna lokalizacja dla notyfikacji PayU).

## 3. Rollback

1. `sudo systemctl stop zastal-store-api zastal-storefront zastal-store-email`.
2. Kod: `deploy/release.sh <poprzedni tag>` (kroki 2–7) albo `git checkout <poprzedni commit>` + `npm run build`.
3. Baza (tylko jeśli dane po migracji są niepożądane): `python3 tools/backup_sqlite.py --verify <kopia>`,
   potem podmień `zastal.sqlite3` na kopię i przywróć `home_media/` z archiwum `tar.gz`.
4. Uruchom usługi i sprawdź `/health`.

## 4. Uruchomienie sprzedaży online (tryb live)

Checkout otwiera się wyłącznie, gdy **jednocześnie**:

1. `.runtime.env` zawiera `ZASTAL_SALES_MODE=live` (restart API), oraz
2. w panelu **Sprzedaż i dostawy** wszystkie 10 kontroli jest zielonych:
   dane sprzedawcy + NIP, cztery adresy polityk HTTPS, potwierdzenia klubu (brand, katalog, spis z natury, dostawca DTF),
   co najmniej jedna metoda płatności (PayU skonfigurowane, przelew z numerem rachunku lub płatność przy odbiorze),
   co najmniej jedna metoda dostawy (odbiór wymaga wpisanego adresu punktu), SMTP skonfigurowane, potwierdzenie
   dokumentowania sprzedaży (kasa fiskalna / faktury).

Zalecana kolejność: sandbox PayU (`ZASTAL_PAYU_ENV=sandbox`, klucze testowe z panelu PayU) → zamówienie testowe
z sandboxową płatnością → sprawdzenie notyfikacji `/api/payments/payu/notify` w `audit_log` i statusu „Opłacone” →
przełączenie na `production` z kluczami z umowy → jedno kontrolowane zamówienie live (np. pracownik, zwrot).
Adres notyfikacji do wpisania w panelu PayU: `https://<domena>/api/payments/payu/notify`.

## 5. Monitoring i codzienne sprawdzenie

- `GET /health` → `{"ok":true,"sales_phase":"live|prelaunch","payments":true|false}`; alarm, gdy `ok=false` lub HTTP ≠ 200.
- `tools/healthcheck.sh [origin]` — jedna sonda dla crona/monitoringu (katalog przez Nginx, strona główna, `/health` lokalnie); kod wyjścia ≠ 0 = alarm, np. `*/5 * * * * /…/tools/healthcheck.sh || logger -t zastal-store 'healthcheck FAILED'`.
- `journalctl -u zastal-store-email -n 50` — worker outboxu; panel **Poczta sklepu** pokazuje kolejkę i błędy.
- Panel **Przegląd** → zamówienia w toku; **Zwroty i reklamacje** → otwarte zgłoszenia; **Sprzedaż i dostawy** → gotowość.
- Timer utrzymania anuluje nieopłacone zamówienia po `unpaid_hours` i zwalnia rezerwacje.
- Kopie: `/var/lib/sentinelx/backups/zastal` (30 ostatnich); raz w miesiącu `--verify` na losowej kopii.

## 6. Testy przed wydaniem (lokalnie lub na stagingu)

```bash
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests
node --test tests/*.test.mjs
cd storefront && npx tsc --noEmit && npm run build && cd ..
python3 tests/e2e/serve.py > /tmp/e2e.json &     # izolowany sklep w trybie live z atrapą PayU
PLAYWRIGHT_ROOT=<ścieżka do globalnego playwright> node tests/e2e/checkout.e2e.mjs "$(cat /tmp/e2e.json)"
```
