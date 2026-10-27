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
| nowe tabele | `store_settings`, `shipping_methods`, `order_details`, `payments`, `payment_notifications`, `payment_refunds`, `pos_shifts`, `returns`, `product_prices`, `stock_alerts`, `promo_codes`, `gift_cards`, `gift_card_transactions` | tworzone puste (`product_prices` dostaje bieżące ceny) |
| `product_options` (2) | kolumny: opis, odznaka, premiera, data dodania | ALTER TABLE |
| `product_options` (3) | kolumny `slug` (adres produktu, uzupełniany z nazwy), `meta_title`, `meta_description` | ALTER TABLE, bez utraty |
| nowe tabele (2) | `subscribers` (newsletter, podwójne potwierdzenie), `contact_messages` (formularz kontaktowy), `site_brand` (podpis i logotypy rozgrywek); tabela `reviews` usuwana przy starcie | CREATE TABLE IF NOT EXISTS |
| `order_details` (2) | kolumny: kod rabatowy, rabat, karta podarunkowa (kod, kwota, e-mail i wiadomość obdarowanego) | ALTER TABLE |
| `pos_sales` (2) | kolumna: kwota z karty podarunkowej | ALTER TABLE |
| `payments` (2) | kolumna `pay_method` (kanał PayU: blik, c, jp, ap) | ALTER TABLE |
| `players` (2) | kolumny `slug` (adres strony zawodnika, uzupełniany z nazwiska), `photo`, `position` | ALTER TABLE, bez utraty |
| nowe tabele (3) | `account_favorites` (ulubione na koncie), `price_alerts` (powiadomienia o obniżce), `cart_drafts` (koszyki do przypomnienia) | CREATE TABLE IF NOT EXISTS |

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

**Kanały PayU w sklepie (BLIK, karta, Google Pay, Apple Pay):** sklep pobiera z PayU (`GET /api/v2_1/paymethods`, odświeżane co 10 minut w tle) listę włączonych metod i pokazuje je pod opcją „Płatność online (PayU)”. Co włączyć po stronie PayU: w panelu PayU metody BLIK, karty, Google Pay i Apple Pay dla danego POS. BLIK: klient może wpisać 6-cyfrowy kod w sklepie (autoryzacja w miejscu, potwierdzenie w aplikacji banku, strona potwierdzenia odświeża się do 2 minut) albo podać go na stronie PayU. Karta: od razu formularz karty na stronie PayU. Google Pay: przycisk w sklepie (skrypt `pay.google.com`), token trafia do PayU jako `authorizationCode`; w produkcji wymagany `ZASTAL_GOOGLE_PAY_MERCHANT_ID` (Google Pay Business Console, z zarejestrowaną domeną sklepu), opcjonalnie `ZASTAL_GOOGLE_PAY_MERCHANT_NAME`; w sandboxie działa bez identyfikatora. **Google Pay trzeba sprawdzić w sandboxie na prawdziwej domenie** (CSP dopuszcza `pay.google.com` i `payments.google.com`; w razie blokady w konsoli przeglądarki uzupełnij `storefront/proxy.ts`). Apple Pay: plik weryfikacyjny od PayU do `storefront/public/.well-known/apple-developer-merchantid-domain-association` (opis w `README.md` obok), potem przycisk pojawia się na stronie PayU w Safari; sklep pokazuje go w opisie metody, bez własnej integracji.

**Feed produktów (Google Merchant Center, Meta Commerce Manager):** `https://<domena>/feed/produkty.xml` (RSS 2.0 z przestrzenią `g:`). Jedna pozycja na rozmiar: `g:id` = SKU wariantu, `g:item_group_id` = SKU produktu, `g:gtin` = EAN, cena brutto PLN (`g:sale_price` przy obniżce z Omnibusa), dostępność ze stanu (`in_stock` / `out_of_stock` / `preorder` dla przedsprzedaży), zdjęcia z galerii, link do produktu z `?rozmiar=`. Przed startem sprzedaży feed jest pusty. W Merchant Center: *Produkty → Źródła danych → Zaplanowane pobieranie* (codziennie), kraj PL, język polski; w Meta: *Katalog → Źródła danych → URL*. Koszty dostawy i zwroty uzupełnia się w ustawieniach konta Merchant Center (feed ich nie niesie).

## 5. Monitoring i codzienne sprawdzenie

- `GET /health` → `{"ok":true,"sales_phase":"live|prelaunch","payments":true|false}`; alarm, gdy `ok=false` lub HTTP ≠ 200.
- `tools/healthcheck.sh [origin]` — jedna sonda dla crona/monitoringu (katalog przez Nginx, strona główna, `/health` lokalnie); kod wyjścia ≠ 0 = alarm, np. `*/5 * * * * /…/tools/healthcheck.sh || logger -t zastal-store 'healthcheck FAILED'`.
- `journalctl -u zastal-store-email -n 50` — worker outboxu; panel **Poczta sklepu** pokazuje kolejkę i błędy.
- Panel **Przegląd** → zamówienia w toku; **Zwroty i reklamacje** → otwarte zgłoszenia; **Sprzedaż i dostawy** → gotowość.
- Timer utrzymania wysyła też powiadomienia o obniżce ceny (`price_alerts`) i jednorazowe przypomnienia o koszyku po 24 h (`cart_reminders`, tylko za zgodą marketingową z zamówienia albo dla potwierdzonych subskrybentów newslettera; link `/koszyk?przywroc=` odtwarza koszyk).
- Timer utrzymania anuluje nieopłacone zamówienia po `unpaid_hours` (domyślnie 336 h = 14 dni; sesja PayU i tak wygasa po 72 h, zamówienie czeka dobę dłużej na notyfikację; ręcznie: przycisk **Wygaś nieopłacone** w panelu Zamówienia), zwalnia rezerwacje, kolejkuje e-maile „produkt znów dostępny” (`restock_alerts`) i w dni robocze po 7:00 wysyła podsumowanie dla obsługi (`digest_sent_to`), jeśli włączone w **Sprzedaż i dostawy**.
- Etykiety: zakładka **Etykiety** drukuje na arkusz A4 albo na drukarkę etykiet (rolka 50 × 30 mm, w oknie drukowania format 50 × 30 i margines 0).
- Panel **Promocje i kody** → kody rabatowe (użycia, limity) i lista klientów czekających na rozmiar.
- Panel **Raporty** → sprzedaż dziennie i CSV dla księgowości (`/api/admin/reports/sales.csv?from=&to=&by=day|product|orders`).
- Skaner z aparatu działa tylko przez HTTPS (wymóg przeglądarek) i wymaga nagłówka `Permissions-Policy: camera=(self)`, który ustawia storefront; przy pierwszym użyciu przeglądarka pyta o zgodę na aparat.
- Kopie: `/var/lib/sentinelx/backups/zastal` (30 ostatnich); raz w miesiącu `--verify` na losowej kopii.

## 6. Testy przed wydaniem (lokalnie lub na stagingu)

```bash
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests
node --test tests/*.test.mjs
cd storefront && npx tsc --noEmit && npm run build && cd ..
python3 tests/e2e/serve.py > /tmp/e2e.json &     # izolowany sklep w trybie live z atrapą PayU
PLAYWRIGHT_ROOT=<ścieżka do globalnego playwright> node tests/e2e/checkout.e2e.mjs "$(cat /tmp/e2e.json)"
```
