# Raport wydania — Zastal Store v0.11 (gałąź `release/official-store-handoff-2026-10`)

Data: 2026-10-24. Punkt wyjścia: `main` @ `60c4d42` (v0.10). Wszystkie zmiany są w małych commitach na gałęzi release i wypchnięte do GitHuba.

## 1. Co zostało zrobione

| Commit | Zakres |
| --- | --- |
| `c145c02` | Audyt (`docs/AUDIT_2026-10-24.md`): tabela funkcja / istnieje / działa / luka / priorytet / test, lista blokad zewnętrznych |
| `35a7e59` | Role personelu (`admin`, `manager`, `warehouse`, `cashier`, `production`, `orders`), uprawnienia per trasa po stronie serwera, ekran **Pracownicy**, jednorazowa migracja tabeli `users` z zachowaniem danych i sesji |
| `50ca3c7` | Tryb sprzedaży `live`/`prelaunch` (przełącznik serwera + 10 kontroli gotowości), metody dostawy, metody płatności (PayU, przelew, przy odbiorze), dane zamówienia (adres, automat, faktura/NIP, zgody), nowe statusy, potwierdzanie wpłat, wysyłka z linkiem śledzenia, wygaszanie nieopłaconych, e-maile dla gości; adapter **PayU** (OAuth, `/api/v2_1/orders`, weryfikacja `OpenPayu-Signature` MD5/SHA-256, idempotentne notyfikacje, kontrola kwoty, refundy) |
| `d560ac7` | Checkout live (kontakt, dostawa, płatność, faktura, zgody), potwierdzenie z danymi przelewu / dokończeniem PayU / śledzeniem, panel **Sprzedaż i dostawy**, akcje płatności i wysyłki w szczegółach zamówienia, aktualizacja Next 16.4.0 → 16.4.3 (ostrzeżenie bezpieczeństwa), harness E2E |
| `48e7440` | Produkty: metoda znakowania (DTF z gotowych transferów, haft, haft 3D, sitodruk), przedsprzedaż, rozmiarówka, **układ nadruku na zatwierdzonym zdjęciu** z edytorem (przeciąganie pól) i podglądem u klienta; niezmienny zapis układu/metody w pozycji zamówienia |
| `5a1ab4b` | POS: zmiany kasowe z raportem (oczekiwana vs policzona gotówka), rabaty z powodem (menedżer), numer paragonu/faktury z kasy fiskalnej (wymagany w trybie live), reszta, wydanie przy ladzie, pełny ekran kiosku, filtr stanowiska nadruków |
| `a67634f` | Zwroty i reklamacje: zgłoszenie przez klienta (strona zamówienia / konto) lub obsługę, decyzje, zwrot środków (PayU, gotówka na zmianie, przelew), przyjęcie na stan, anulowanie po personalizacji z odpisem (tylko menedżer), druk potwierdzenia |
| `e914831` | Wdrożenie: `tools/backup_sqlite.py` (backup online + media + **test przywrócenia**), `tools/maintenance.py` + timer, jednostki systemd, Nginx (HSTS, osobna lokalizacja PayU), `deploy/release.sh`, nagłówki bezpieczeństwa (CSP, Permissions-Policy, X-Frame-Options), `robots.txt`/`sitemap.xml` zależne od trybu, `docs/RELEASE_RUNBOOK.md` |
| `190264d` | Strony informacyjne (regulamin, polityka prywatności, zwroty, dostawa, kontakt): prywatne szkice z oznaczonymi polami `[UZUPEŁNIJ]`, publikacja po potwierdzeniu przeglądu, bezpieczne renderowanie `/informacje/<slug>` |
| `4488fb9` | Dynamiczna strona **Pomoc** (treści z konfiguracji live), README v0.11, dowody w `docs/evidence/`, ten raport |
| (przegląd) | **Omnibus**: historia cen produktów (`product_prices`), komunikat „Najniższa cena z 30 dni przed obniżką” na karcie, w podglądzie i na stronie produktu; **odzyskanie linku do zamówienia** przez numer + e-mail (bez ujawniania istnienia zamówienia, limit prób); e-maile: „Zapłacono” dla zamówień już opłaconych, informacja o przedsprzedaży przy pozycji; panel: metryki tylko z opłaconych zamówień live, „Oczekują na płatność”, sprzedaż z dzisiaj, wyszukiwanie po kliencie/e-mailu/przesyłce, CSV z klientem i płatnością, statusy sterowane procesem zablokowane w ręcznej liście; tekst **Uruchomienia sklepu** zgodny z rzeczywistym przełącznikiem; `tools/healthcheck.sh` |
| (design) | **DESIGN.md** z zasadami wyglądu; krój wyświetlany Barlow Semi Condensed (self-hosted) dla nagłówków i cen; usunięte numerowane etykiety sekcji, ozdobne mikro-napisy, celownik, pasek haseł pod hero i półpauzy w treści; nazwy produktów bez pauz; **CSP z nonce** per żądanie (`proxy.ts`, bez `'unsafe-inline'` dla skryptów); historia cen w formularzu produktu w panelu; nowe zrzuty `docs/evidence/home-*`, `product-desktop-1440.png` |

Zachowano: istniejące API i dane, CMS strony głównej, galerie, konta, historię zamówień, POS testowy (nadal działa w trybie prelaunch), wygląd premium streetwear. Żadna migracja nie usuwa danych (tabela w runbooku).

## 2. Wyniki testów (na HEAD gałęzi)

| Zestaw | Wynik |
| --- | --- |
| `ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests` | **158 / 158 OK** (było 136; nowe: `test_staff`, `test_sales` z PayU/POS/zwrotami, `test_pages`, `test_pricing`, rozszerzony `test_personalization`) |
| `node --test tests/*.test.mjs` | **84 / 84 OK** (było 81) |
| `npx tsc --noEmit` | bez błędów |
| `npm run build` (Next 16.4.3) | OK, bez ostrzeżenia bezpieczeństwa |
| E2E Playwright (`tests/e2e/checkout.e2e.mjs` na izolowanym sklepie w trybie live z atrapą PayU) | **27 / 27 OK**: komunikat Omnibus, formularz odzyskania linku, mobilny checkout 390 px z przelewem, walidacja formularza, PayU z podpisaną notyfikacją i potwierdzeniem opłacenia, panel (ustawienia, potwierdzenie wpłaty, kolejka realizacji, edytor układu nadruku, kasjer z ograniczoną nawigacją), POS (otwarcie zmiany, sprzedaż z numerem paragonu, raport zmiany, kiosk), zwroty, strony informacyjne, pomoc |

Zrzuty ekranu (320–1440 px) i log: `docs/evidence/`. Pełny zestaw powstaje lokalnie w `.qa/e2e/` po uruchomieniu scenariusza.

## 3. Stan wdrożenia

- **Serwer AMS nie został zmieniony** z tej sesji: brak dostępu SSH/HTTPS do `51.15.21.164`. Aktywne wdrożenie nadal odpowiada v0.10 z `main`. Porównanie deployu z HEAD, logi usług i pliki runtime trzeba sprawdzić na serwerze (kroki 0–2 runbooka).
- Procedura wdrożenia: `deploy/release.sh release/official-store-handoff-2026-10` (backup → testy → build w izolacji → rsync bez `.runtime.env`, bazy i mediów → migracje → restart → `/health`). Rollback opisany w runbooku.
- Po wdrożeniu sklep pozostaje w **prelaunch** (checkout 503) do czasu ustawienia `ZASTAL_SALES_MODE=live` i spełnienia 10 kontroli w panelu. To celowe: żadna zmiana w panelu nie uruchamia sprzedaży sama.
- Nie wykonano: PR do `main` (zgodnie z poleceniem commity są na gałęzi release; PR utworzę na życzenie), realnego testu sandbox PayU (brak kluczy), wysyłki testowych e-maili (brak SMTP).

## 4. Wymaga Twojej decyzji / danych

1. **PayU**: POS ID, OAuth client_id/secret, drugi klucz (MD5) — najpierw sandbox, potem produkcja; w panelu PayU adres notyfikacji `https://<domena>/api/payments/payu/notify`. Bez tego metoda PayU nie pojawia się klientom.
2. **Dane sprzedawcy** (nazwa, NIP, adres, kontakt, adres zwrotów) — zakładka **Uruchomienie sklepu**.
3. **Teksty prawne**: regulamin, polityka prywatności, zwroty, dostawa — szkice w **Strony informacyjne** mają oznaczone pola do uzupełnienia; publikacja dopiero po akceptacji prawnika; potem wpisz ich adresy HTTPS w **Uruchomienie sklepu**.
4. **Dostawy**: które metody włączyć, ceny, próg darmowej dostawy, przewoźnik i szablon linku śledzenia (obsługa wpisuje numer przesyłki ręcznie; integracja etykiet API przewoźnika nie jest podłączona — do decyzji, czy jest potrzebna).
5. **Przelew tradycyjny**: numer rachunku, odbiorca, bank; czas oczekiwania na wpłatę (domyślnie 72 h). **Płatność przy odbiorze**: tak/nie.
6. **Fiskalizacja**: system nie fiskalizuje; kasjer wpisuje numer paragonu/faktury z kasy fiskalnej klubu. Potwierdź ten tryb pracy (checkbox „Potwierdzam, że sprzedaż jest dokumentowana…”) albo wskaż integrację z drukarką fiskalną/KSeF jako kolejny etap.
7. **SMTP/ESP** (host, port, konto nadawcy, hasło) + rekordy SPF/DKIM/DMARC w DNS domeny nadawcy.
8. **Katalog i zdjęcia**: zatwierdzenie zdjęć produktów (status „materiał poglądowy”), cen, rozmiarówek, metod znakowania per produkt, układów nadruku (i czy któryś został skalibrowany na gotowym egzemplarzu), spis z natury (import CSV).
9. **Konta pracowników**: komu nadać role manager / magazyn / kasjer / produkcja / obsługa zamówień.
10. **Domena produkcyjna** (zamiast `sslip.io`) i certyfikat — wpływa na `ZASTAL_SITE_ORIGIN`, PayU `continueUrl/notifyUrl` oraz linki w e-mailach.
11. **Uruchomienie**: zgoda na przełączenie `ZASTAL_SALES_MODE=live` po kontrolowanym zamówieniu testowym w sandboxie PayU i jednym kontrolowanym zamówieniu live.

## 5. Znane ograniczenia i następne kroki (poza blokadami powyżej)

- CSP: skrypty tylko z nonce (`storefront/proxy.ts`); style nadal `'unsafe-inline'` (atrybuty `style` w CMS i edytorze układu).
- Podgląd nadruku jest poglądowy, dopóki układ nie zostanie oznaczony jako skalibrowany na fizycznym egzemplarzu.
- Automatyczna wysyłka wiadomości wymaga działającego workera `zastal-store-email` (unit w `deploy/`).
- Notatki projektu: w tej sesji nie było dostępu do Twojego Vaulta (ani notatek na Dysku Google o Zastalu), dlatego cała dokumentacja robocza jest w `docs/` repozytorium.
