# AGENTS.md

Zastal Store: sklep klubowy Zastalu Zielona Góra. Backend w Pythonie (stdlib HTTP + SQLite), storefront w Next.js 16 App Router (React 19, Tailwind v4, zestaw kairoui „essentials”), płatności PayU, panel pracowników pod `/admin`.

## Commands

```bash
python3 commerce_api.py                                   # API (port 8880), schemat tworzy się sam przy starcie
cd storefront && npm run dev                              # storefront (port 8878), proxy /api -> 8880
cd storefront && npx tsc --noEmit && npm run build        # typy + build produkcyjny (Turbopack)
ZASTAL_TEST_MODE=isolated-only python3 -W ignore -m unittest discover -s tests   # testy backendu (~2 min)
node --test tests/*.test.mjs                              # testy jednostkowe storefrontu
python3 tests/e2e/serve.py > /tmp/e2e.json &              # izolowany sklep w trybie live z atrapą PayU
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e/checkout.e2e.mjs "$(cat /tmp/e2e.json)"   # E2E w przeglądarce
python3 tools/maintenance.py                              # wygasanie nieopłaconych, powiadomienia o dostępności, podsumowanie dnia
bash tools/healthcheck.sh                                 # stan usług na serwerze
```

## Key files & directories

```
commerce_api.py           # routing HTTP, katalog (/api/catalog, /api/catalog/{slug|id}), zamówienia, panel
commerce_auth.py          # role, uprawnienia (ROLE_CAPABILITIES), prefiksy tras (ROUTE_CAPABILITIES), sesje (osobne ciasteczka: konto klienta i panel)
commerce_sales.py         # ustawienia sprzedaży, szczegóły zamówień, statusy, e-maile o zamówieniu
commerce_payments.py      # PayU REST (OAuth, zamówienia, notyfikacje, zwroty, lista kanałów BLIK/karta/Google Pay/Apple Pay, kod BLIK i token portfela)
commerce_ops.py           # kasa POS, zmiany kasowe, realizacja (kompletacja, nadruki, wydanie)
commerce_personalization.py  # produkty i opcje (slug, SEO, odznaki, premiery, karta), zawodnicy
commerce_merch.py         # odznaki, premiery, powiadomienia o dostępności, kody rabatowe
commerce_giftcards.py     # karty podarunkowe
commerce_engage.py        # newsletter (podwójne potwierdzenie), wiadomości z formularza
commerce_retention.py     # ulubione na koncie, powiadomienia o obniżce ceny, przypomnienia o porzuconym koszyku
commerce_brand.py         # podpis sklepu i logotypy rozgrywek (upload PNG/WebP z panelu)
commerce_mailtheme.py     # wersja HTML każdego e-maila w barwach sklepu, podgląd w panelu Poczta
commerce_email.py         # kolejka wiadomości (outbox) i treści
commerce_reports.py, commerce_digest.py, commerce_returns.py, commerce_dpd.py, commerce_cms.py, commerce_pages.py, commerce_media.py, commerce_pricing.py, commerce_launch.py
storefront/app/           # strony: /, /sklep, /kategoria/[slug], /szukaj, /produkt/[handle], /koszyk, /zamowienie, /konto, /pomoc, /kontakt, /newsletter, /zawodnicy, /zawodnicy/[slug], /karta-podarunkowa, /informacje/[slug], /admin (podglad/kod = plakat QR kodu rabatowego); feed/produkty.xml (Google Merchant / Meta, tylko w trybie live)
storefront/app/admin/       # HomeEditor.tsx (edytor strony głównej), home-pickers.tsx (wybór produktów i kategorii), podglad/ (podgląd w iframe)
storefront/components/    # StoreShell (nagłówek, koszyk, stopka), HomeCanvas (sekcje CMS), ProductCard, PurchaseControls, CompetitionLogos, search/SearchBox, PromoField, NewsletterForm
storefront/components/templates/essentials/ui/texture-button.tsx   # przycisk z zestawu kairoui, bez zmian
storefront/lib/           # commerce.mjs (koszyk, filtry, productPath), money.ts, json-ld.tsx, site.ts, catalog-paths.ts, home-layout.ts
storefront/app/tailwind.css, kit.css   # tokeny i warstwy CSS (patrz DESIGN.md)
tests/, tests/e2e/        # unittest (Python), node:test, Playwright
docs/                     # runbook wdrożenia, raport wydania, szablon opisu produktu
```

## Project patterns

- Pieniądze: zawsze całkowite grosze w API i bazie; w storefroncie `fmt()` z `lib/catalog.ts` lub `formatMoney()` z `lib/money.ts`.
- Adresy produktów: `productPath(product)` z `lib/commerce.mjs` (slug, z numerem id jako zapasem). Numeryczny adres przekierowuje na slug z zachowaniem query.
- Kategorie: `lib/site.ts` (`CATEGORY_SLUGS`, `categoryPath`). Nowa kategoria to zmiana w `commerce_personalization.CATEGORIES` i w tej mapie.
- Zapisy do bazy wymagające odczytu i zapisu (stany, salda, kody) zawsze w `BEGIN IMMEDIATE`; wywołania sieciowe do PayU poza transakcją.
- Nowa trasa `/api/admin/...` wymaga wpisu w `ROUTE_CAPABILITIES`; widok w panelu dostaje `cap` w tablicy `views` w `app/admin/page.tsx`.
- Publiczne formularze (opinie, newsletter, kontakt, powiadomienia) mają limit prób (`public_rate`) i pole-pułapkę `website`.
- E-maile: `commerce_email.enqueue_guest(c, kind, recipient, dedupe)` z rodzajem w `GUEST_KINDS` i gałęzią w `_message`.
- Nowa kolumna opcji produktu: `DEFAULT_OPTIONS` + `EXTENDED_COLUMNS` + `validate_product` + `save_options` w `commerce_personalization.py`.
- Storefront: komponenty klienckie w zwięzłym JSX, klasy Tailwind, ikony `reicon-react` (nowe widoki) lub `lucide-react` (panel). Stare arkusze CSS żyją w warstwie `legacy` i nie wygrywają z utilities.
- Zdjęcia: `ProductImage` z `sizes` (albo `next/image` z `fill`) dla lokalnych ścieżek `/assets/**` i `/api/store/media/**` (optymalizator w `next.config.mjs`); bez `sizes` zostaje zwykły `<img>` dla starych arkuszy. SVG i adresy zewnętrzne zawsze `unoptimized`.
- Próg darmowej dostawy liczy się od wartości produktów **po** rabacie (API `shipping_cost(method, subtotal-discount)`, storefront `FreeShipping`/`CheckoutClient` tak samo). Nieopłacone zamówienia wygasają po `unpaid_hours` (domyślnie 336 h = 14 dni; PayU ma własny limit 72 h) przez `tools/maintenance.py` albo przycisk „Wygaś nieopłacone” w panelu.
- PayU: kanał płatności z checkoutu (`payment_channel`) przechodzi przez `payments.parse_channel`; odpowiedź bez `redirectUri` jest poprawna tylko dla kodu BLIK/tokenu portfela (`awaiting_confirmation`). Lista kanałów `payments.pay_methods()` odświeża się w tle, nigdy nie blokuje `/api/store/status`.
- Zdjęcia zawodników i logotypy tylko z uploadu w panelu (`brand.write_image`), adres `/api/store/media/<hash>.webp`; strona zawodnika pod `/zawodnicy/<slug>` (slug z nazwiska, `player_slug`).
- Przypomnienia o koszyku wymagają podstawy (zgoda marketingowa z formularza albo potwierdzony newsletter); `retention.save_draft` bez niej nic nie zapisuje.
- Sesje: konto klienta i panel pracowników to dwie niezależne sesje w jednej przeglądarce. Klient: ciasteczko `__Host-zastal_session`, trasy `/api/auth/*` i `/api/account/*`. Panel: ciasteczko `__Host-zastal_staff`, trasy `/api/staff/auth/{session,login,logout,recover,password,profile,recovery-key,logout-others}` oraz `/api/admin/*`. Zakres wynika ze ścieżki (`auth.scope_of`); konto pracownika nie loguje się w sklepie, klient nie loguje się do panelu, a wylogowanie z jednego nie rusza drugiego. W storefroncie `AuthProvider scope="staff"` opakowuje `app/admin/layout.tsx`; w testach `Client.login()` wybiera drzwi po loginie (z `@` = klient).
- Karta produktu pokazuje drugie zdjęcie z galerii po najechaniu (CSS, bez JS); tylko produkty z co najmniej dwoma zdjęciami w galerii, bez zdjęć zastępczych.
- Hero na stronie głównej zmienia slajdy samo; zatrzymuje je tylko przycisk Pauza, nawigacja klawiaturą, ukryta karta i otwarte okna (nie hover i nie „ogranicz ruch”).
- Nagłówek to jeden szklany pasek (`glass-header`: `bg-background/70`, `backdrop-blur-xl`) 64 px, nawigacja od szerokości `xl`, poniżej szuflada; offsety stron `pt-16` (`pt-24` z paskiem informacji).
- Edytor strony głównej: podgląd to prawdziwa strona `/admin/podglad` (StoreShell + `HomeCanvas editing`) w iframe 1440 px albo 390 px, skalowana do wolnego miejsca; protokół `postMessage`: edytor wysyła `zastal:home:preview` i `zastal:home:select`, podgląd odpowiada `zastal:home:ready` i `zastal:home:picked` (klik w sekcję zaznacza ją, linki i formularze w podglądzie są zablokowane, autoplay hero wyłączony). Niezapisany szkic trzyma `localStorage` (klucz z wersją bazową), publikacja przechodzi przez okno z listą zmian z `lib/home-diff.mjs`; skróty Ctrl/Cmd+S, Z, Y.
- Nic fikcyjnego: brak atrap integracji, numerów przesyłek czy dokumentów poza izolowanym środowiskiem testowym.

## Validation checklist

- [ ] `npx tsc --noEmit` w `storefront/`, bez błędów
- [ ] `npm run build` w `storefront/`
- [ ] `node --test tests/*.test.mjs`
- [ ] `ZASTAL_TEST_MODE=isolated-only python3 -W ignore -m unittest discover -s tests`
- [ ] E2E Playwright na izolowanym sklepie (`tests/e2e/serve.py` + `checkout.e2e.mjs`)
- [ ] Zrzuty ekranu 1440 px i 390 px dla zmienionych stron, bez błędów w konsoli
- [ ] Sekrety tylko w `.runtime.env`, nigdy w repozytorium; brak identyfikatorów modeli w kodzie i commitach
