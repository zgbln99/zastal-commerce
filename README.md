# Zastal Commerce OS

Nowoczesny sklep kibica Zastal Zielona Góra i demonstracyjne zaplecze operacyjne.
**Status: v0.2 — działające publicznie DEMO, bez realnych płatności i wysyłek.**

## Demo

- Sklep: https://zastalstore.51-15-21-164.sslip.io/
- Panel administratora: https://zastalstore.51-15-21-164.sslip.io/admin
- Publiczne API produktów: `GET /api/products`
- Testowe zamówienia: `POST /api/orders`
- Panel zamówień: `GET /api/admin/orders` z tokenem `Authorization: Bearer ...`

## Architektura

| Element | Ścieżka | Technologia |
| --- | --- | --- |
| Sklep | `storefront/` | Next.js 16, React 19, TypeScript |
| Panel administracyjny | `storefront/app/admin/` | Next.js, dashboard, lista zamówień, magazyn i etykiety |
| Demo API / zamówienia | `app.py` | Python standard library + SQLite |
| Synchronizacja produktów demo | `scripts/sync_demo_catalog.py` | Python |
| Aplikacja Android | przyszły etap | Kotlin + Jetpack Compose |

Wersja 0.2 zawiera dwanaście poglądowych produktów z fotografiami podlinkowanymi z zastal.store. Dane są demonstracyjne. Katalog i grafiki wymagają zatwierdzenia przez klub przed uruchomieniem produkcyjnym.

## Uruchomienie lokalne

W osobnym terminalu:
```bash
python3 app.py
```

W drugim:
```bash
cd storefront
npm install
npm run dev
```

W wersji deweloperskiej frontend domyślnie korzysta z API na `127.0.0.1:8880`, a domyślna instancja `python3 app.py` na `8877`. Dla lokalnej pracy uruchom API z `ZASTAL_PORT=8880`, a dla uprawnień administracyjnych ustaw `ZASTAL_ADMIN_TOKEN`.

## Serwer AMS

Środowisko demonstracyjne działa jako osobne jednostki systemd:

- `zastal-storefront.service`: port `127.0.0.1:8879`
- `zastal-store-api.service`: port `127.0.0.1:8880`

Nginx wystawia HTTPS i kieruje żądania na frontend. Klucz administratora pozostaje na serwerze w ignorowanym przez Git pliku `.runtime.env`. **Nie commituj sekretów ani plików SQLite.**

Po aktualizacji repo: `git pull --ff-only`, `cd storefront && npm install && npm run build`, a następnie restart odpowiednich usług. Przed wdrożeniem produkcyjnym wymagane są migracja do PostgreSQL, konta i role, audyt, pełny magazyn wariantów, płatności, integracje dostaw, obsługa RODO oraz testy bezpieczeństwa.

## Etykiety

Panel generuje i drukuje **EAN-13 z prefiksem ograniczonego obiegu 200** oraz kod QR zawierający identyfikator i SKU produktu. To oznaczenia *wewnętrzne*, a nie zarejestrowane globalnie numery GTIN/GS1. Druk etykiet A4 jest dostępny w module „Etykiety EAN / QR”.

## Proces DTF

Klub zamawia **gotowe transfery DTF od zewnętrznego dostawcy** i nanosi je na odzież. Kompletny system ewidencji przyjęć nadruków, partii produkcyjnych i stanów rozmiarowych jest zaplanowany; w v0.2 moduł pokazuje proces, ale jeszcze nie wykonuje tych operacji.

## Status demonstracji

**Działa:** wygląd sklepu, katalog, wyszukiwarka, kategorie i sortowanie, wybór rozmiaru, koszyk, zapisywanie zamówień testowych z rozmiarem, lista zamówień, zmiana statusów, eksport CSV, podgląd stanów, EAN-13 i QR, druk etykiet.

**Do wykonania:** pełne warianty stanów, produkcja DTF, zwroty, dostawy, prawdziwy checkout i płatności, automatyzacje, dostępność i testy e2e, aplikacja Android.

Nie należy przyjmować prawdziwych zamówień klientów na tej wersji.
