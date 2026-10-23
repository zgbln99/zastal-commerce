# Zastal Store — przekazanie do Claude / wydanie produkcyjne

Stan analizy: 2026-10-24. Repo: `zgbln99/zastal-commerce`, baza: `main` @ `60c4d42133aa5b26eb261da1fd0705f1265d849a`.

## Rola i cel
Jesteś senior full-stack engineer i release owner. Dokończ **oficjalny sklep Zastal Zielona Góra** oraz zaplecze menedżera sklepu. To produkt produkcyjny dla realnych klientów, stanów magazynowych i personelu. Nie twórz nowego projektu ani demonstracji. Kontynuuj istniejące repo; zachowaj API, dane, CMS, historie zamówień, identyfikatory, personalizacje i wygląd premium streetwear. Interfejs po polsku.

## Potwierdzony punkt startowy
Ostatni commit na main to `60c4d421` (2026-10-12), oznaczony w README jako v0.10. Technologia: Next.js 16 / React 19 / TS w `storefront/`, Python stdlib API w `commerce_api.py`, SQLite na serwerze poza repo. Wdrożenie AMS: usługi `zastal-storefront.service` i `zastal-store-api.service`; docelowy obecny URL: https://zastalstore.51-15-21-164.sslip.io/. Legacy `app.py` nie jest wdrożonym API. GitHub na dzień analizy ma jedynie gałąź `main`, bez PR.

Istnieją: edytowalny CMS strony głównej, rewizje szkic/publikacja, galerie, upload/role zdjęć, slider, katalog i filtracja, konto klienta, reset i weryfikacja e-mail poprzez outbox, administracja produktami i zawodnikami, warianty i stany, EAN/QR wewnętrzne, DTF z gotowymi transferami od dostawców, POS w trybie testowym, realizacja zamówień z picking/print/quality, log audytu oraz podstawowe testy. Według opisu commita: 136 testów Python i 81 Node przeszło; sprawdź ponownie na aktualnym HEAD.

**Blokery**: brak potwierdzonej integracji płatności, rzeczywistych dostaw i dokumentów sprzedaży; brak skonfigurowanego SMTP; brak zatwierdzonych danych sprzedawcy, polityk i faktycznych stanów; brak zweryfikowanego uruchomienia realnego checkout. `POST /api/orders` celowo zwraca `503 store_prelaunch`. POS tworzy tylko sprzedaże testowe. Nie usuwaj tych blokad przed gotowością.

## Zadania w kolejności
1. **Audyt źródeł i serwera**: `git status`, `git log`, lista plików, migracje i modele, testy, logi usług, Nginx, pliki runtime. Porównaj aktywny deploy z HEAD; poszukaj pozostawionych przez Work niezacommitowanych zmian. Udokumentuj, co faktycznie działa i nie działa. Nie wyświetlaj sekretów w logach.
2. **Stabilizacja sklepu**: pełen przegląd i naprawy produktów/edycji, CMS i slidera, mobilnego UX (320/390/768/1440), koszyka, kont, logowania, ulubionych, wyszukiwania, SEO, dostępności, galerii, wydajności i obsługi błędów. Żadnych atrap, nieaktywnych przycisków, fikcyjnych recenzji ani lorem ipsum. Premium streetwear bez szablonowego „AI” designu.
3. **Katalog i druk**: koszulki, bluzy, akcesoria, merch meczowy oraz preordery; kolory, rozmiary, ceny, SKU, zdjęcia, warianty. Personalizacja nazwisko/numer/zawodnik z podglądem na rzeczywistym zatwierdzonym zdjęciu/mockupie produktu, z zapisaniem niezmiennego układu/rozmiaru/pozycji nadruku do pozycji zamówienia. Zaprojektuj aplikację i technologię podglądu z poprawnymi wymiarami i bez obietnicy wiernego odwzorowania, jeśli nie ma kalibracji. DTF, haft, wypukły haft i sitodruk jako metody wykonania, o ile operacyjnie zatwierdzone. Klub kupuje GOTOWE transfery DTF od dostawcy i nanosi je na odzież; nie przypisuj klubowi własnej drukarni DTF.
4. **Zamówienia i magazyn**: spójne stock/reservations/returns, magazyn online i kasa współdzielą warianty, skanowanie EAN/QR, korekty z powodem, import/eksport, audyt, preordery z kontrolą dostępności i dat realizacji bez niepotwierdzonych obietnic; workflow: opłacone/potwierdzone → kompletacja → transfer/nadruk/haft → kontrola jakości → pakowanie → nadanie/odbiór → zwrot/reklamacja. Rozróżnij anulowanie przed i po personalizacji.
5. **POS pełnoekranowy**: ergonomia kasjera, skaner, wyszukiwanie, szybka sprzedaż, wariant i personalizacja, rabaty/uprawnienia, stany, raport i podsumowanie zmiany, stanowisko aplikacji nadruków (widok zlecenia + szczegóły pozycji), odrębne role. Finalizacja prawdziwej sprzedaży tylko po legalnym i technicznym wdrożeniu fiskalizacji/dokumentów i płatności; nie udawaj integracji.
6. **Realny e-commerce**: przygotuj adaptery wybranego, zatwierdzonego operatora płatności i wybranych przewoźników/odbioru osobistego. Serwerowe webhooki, podpisy, idempotencja, rozliczenia, anulowania/refundy, niepodwójne rezerwacje, koszty dostaw, track & trace, failure/recovery. Nie zbieraj ani nie przechowuj danych kart. Gdy brak umów, kluczy lub cen, przygotuj konfigurację i checklistę zamiast fikcyjnych danych.
7. **E-mail**: konfiguracja SMTP/ESP poza Git, weryfikacja klienta, reset, potwierdzenia zamówień i statusów; kolejka, retry, monitoring, szablony PL, SPF/DKIM/DMARC do konfiguracji, polityka wysyłek i zgody marketingowe oddzielnie. Nie wysyłaj realnych maili z testów.
8. **CMS/admin**: pełna edycja treści, kolekcji, bannerów, slidera, landing pages i galerii; harmonogram publikacji kampanii jeżeli uzasadniony. Role: właściciel/manager, magazyn, kasjer, produkcja, obsługa zamówień. Różne uprawnienia i log czynności. Panel admin niedostępny w publicznej nawigacji (ale chroniony przede wszystkim autoryzacją).
9. **Ochrona i zgodność**: bezpieczne sesje i CSRF, walidacja, rate limit, izolacja IDOR, upload i MIME, XSS/SQLi, headers, kopie, retencja, minimalizacja danych klientów, polityka prywatności/RODO, regulamin, zwroty, reklamacje, wymagane informacje o sprzedawcy, ceny brutto i obowiązki informacyjne. Teksty prawne wymagają zatwierdzenia przez sprzedawcę i prawnika; nie przedstawiaj ich jako zweryfikowanych. Sprawdź aktualne polskie wymogi e-commerce przed wdrożeniem.
10. **Wydanie**: migruj bez utraty danych; backup + test przywrócenia, środowisko staging, testy jednostkowe/integracyjne/E2E desktop-mobile, proces rollback, health checks, monitoring i alerty. Pokaż dowody działania zamiast samego „gotowe”.

## Twarde ograniczenia
- Nie nadpisuj bazy SQLite, nie kasuj historycznych zamówień, zdjęć, kont, transakcji, audytu ani konfiguracji serwera. Sekrety tylko poza repo (np. `.runtime.env`).
- Nie uruchamiaj niezatwierdzonej sprzedaży, nie obchodź `store_prelaunch`, nie oznaczaj testowych POS jako fiskalnych ani prawdziwych, nie generuj fikcyjnych trackingów/dokumentów.
- Nie publikuj przed uzyskaniem od właściciela **danych sprzedawcy, zgody na branding i materiały, zatwierdzonej oferty/cen i stanów, polityk, danych płatności, umów dostawczych oraz wymaganej obsługi podatkowej/fiskalnej**.
- Nie zmieniaj UI na losowy gotowy szablon. Dotychczasowa koncepcja premium streetwear; wyraźne zdjęcia realnych produktów, prosta typografia, responsywność.
- Kod iteracyjnie w małych commitach i PR. Nie wdrażaj na produkcję bez sprawdzenia kopii zapasowej, migracji i zatwierdzenia checklisty.

## Jak pracować
Najpierw opublikuj audyt z tabelą: funkcja / istnieje / działa / luka / priorytet / test. Potem plan i wykonuj zmiany w repo, nie zatrzymując się na samym planie. Dla każdej zmiany podawaj commit i test. Gdy brak zewnętrznych danych lub integracji, zakończ działający moduł w stanie bezpiecznie zablokowanym i oznacz konkretny blokujący input; przejdź dalej.

Weryfikacja minimalna: `ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests -v`, `node --test tests/*.test.mjs`, `cd storefront && npx tsc --noEmit && npm run build`; uzupełnij o E2E. Testy na izolowanej DB. Upewnij się, że produkcyjne usługi działają jak przed wdrożeniem.

### Kryterium DONE
Oficjalne uruchomienie dopiero gdy checkout z REALNĄ płatnością w sandbox i kontrolowanym teście live, zamówienia/stan/dostawa/zwroty/POS/dokumenty i e-maile są zweryfikowane, właściciel zatwierdził dane prawne/produkty/ceny, a backup/rollback i monitoring są sprawdzone. W przeciwnym razie pozostaw prelaunch, a jako wynik dostarcz sprawny kod, PR, raport testów, dokładną listę blokad i instrukcję uruchomienia. Nie deklaruj zakończenia bez tych dowodów.
