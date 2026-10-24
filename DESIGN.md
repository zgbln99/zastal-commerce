# DESIGN.md: Zastal Store

Zasady wyglądu oficjalnego sklepu Zastalu Zielona Góry. Plik jest dla ludzi i dla agentów AI,
które zmieniają `storefront/`. Zmiana, która łamie te zasady, nie jest „ulepszeniem”.

## 1. Czym jest ten sklep

Sklep kibica klubu koszykarskiego: koszulki, bluzy, akcesoria, nadruk z nazwiskiem i numerem.
Ma wyglądać jak sklep zespołu sportowego i marki streetwear, nie jak szablon SaaS.
Klient kupuje na telefonie, często z trybun. Priorytet: zdjęcie produktu, cena, rozmiar, przycisk „Dodaj do koszyka”.

## 2. Tokeny

Warstwa wizualna jest zbudowana na zestawie **kairoui „essentials”** (Tailwind v4 + zmienne shadcn + `TextureButton` z Base UI),
wypełnionym barwami klubu. Źródłem prawdy są zmienne w `storefront/app/tailwind.css`; poniżej ich znaczenie.

```yaml
colors (oklch, zmienne shadcn):
  primary: "oklch(0.40 0.13 145)"  # zieleń Zastalu; przyciski główne, aktywne pigułki, numery zawodników
  foreground: "oklch(0.22 0.02 150)"   # tekst
  muted-foreground: "oklch(0.48 0.02 150)"  # tekst pomocniczy (kontrast ≥ 4.5:1 na tle)
  background: "oklch(0.985 0.004 145)"; card: biały; muted: "oklch(0.955 0.006 145)"  # tła strony, kart, kafli zdjęć
  accent: "oklch(0.93 0.03 145)"     # jasnozielone podświetlenie (wybrana dostawa, chipy filtrów)
  orange (--brand-orange): "oklch(0.70 0.19 55)"  # pomarańcz klubowy: odznaki Promocja/Wyprzedaż, licznik ulubionych, ostatnie sztuki
  border / input: "oklch(0.90 0.008 145)"
  destructive: "oklch(0.58 0.19 28)"
typography:
  face: "ZT Talk" (medium/semibold/bold, self-hosted); zapas Inter
  h1: "text-3xl sm:text-4xl lg:text-5xl, font-medium, tracking-tight, leading 1.05-1.1"; hero "text-5xl sm:text-6xl lg:text-7xl"
  h2 sekcji: "text-2xl sm:text-3xl font-medium"
  eyebrow: "text-xs uppercase tracking-[0.2em] text-primary"
  body: text-sm / text-base, tekst pomocniczy text-xs
radius: "--radius: 0.7rem" (przyciski rounded-lg, karty rounded-xl, kafle kolekcji i panele rounded-2xl, pigułki nawigacji i filtrów rounded-full)
container: max-w-7xl (1280px), 16px marginesu na telefonie, 24/32px wyżej
header: stały (fixed) pasek 64px + rząd kategorii 44px na desktopie; strony zaczynają się pod nim, hero strony głównej wchodzi pod niego
touch: min 44px wysokości dla przycisków i pól
```

Nazwy zmiennych, które czytają starsze arkusze (`--forest`, `--ink`, `--line`, `--paper`, `--legacy-muted`, `--legacy-accent`, `--legacy-radius`),
są podpięte do powyższych tokenów w tym samym pliku. Nie definiuj ich ponownie.

Jeden kolor akcentu (pomarańcz) i jeden kolor marki (zieleń). Nie wprowadzaj fioletów, neonów ani poświaty.
Gradienty tylko dwa: przyciemnienie zdjęć pod tekstem (hero, kafle kolekcji, banery) i wewnętrzny gradient `TextureButton`.

## 3. Typografia i teksty

- Nagłówki w kroju wyświetlanym, zdania pisane normalnie: „Twoje nazwisko. Twój numer.” Bez WERSALIKÓW w nagłówkach.
- Małe etykiety nad nagłówkiem („kicker”) tylko tam, gdzie niosą informację (nazwa kolekcji, kategoria).
  Maksymalnie jedna etykieta na trzy sekcje strony. Nigdy numerowane („01 / KATEGORIE”), nigdy z ukośnikami.
- Bez półpauz i pauz (– —) w treści; używaj przecinka, kropki lub dwukropka.
- Bez kropek środkowych (·) jako separatorów w zdaniach; dopuszczalne tylko w metadanych (np. „Polska · PLN”).
- Bez ozdobnych mikro-napisów: numerów seryjnych, „EST. 1946”, „ZG / 1946”, pasków z hasłami pod hero,
  liczników „01 / 03”, podpowiedzi „Przesuń, aby zobaczyć”.
- Teksty po polsku, zwięzłe, bez marketingowych wypełniaczy („odkryj”, „wyjątkowy”, „przenieś na wyższy poziom”).
- Liczby i ceny w formacie polskim: „65,00 zł”, „Najniższa cena z 30 dni przed obniżką: 65,00 zł”.

## 4. Układ

- Strona główna: hero ze zdjęciem (karuzela z CMS), kafle kategorii, sekcja personalizacji, siatka produktów,
  jedna sekcja kampanii, akcesoria, linki serwisowe, stopka. Każda sekcja ma inny układ; nie powtarzaj
  dwóch sąsiednich sekcji „zdjęcie z lewej, tekst z prawej”.
- Karta produktu: zdjęcie w proporcji 3:4 na tle `paper`, kategoria i rozmiary małym tekstem, nazwa, cena.
  Jedna odznaka na zdjęciu, tylko ze znaczeniem i tylko z danych: Wyprzedane, Przedsprzedaż, Premiera (z datą),
  Promocja (po obniżce z historii cen), Bestseller (opłacona sprzedaż z 30 dni), Nowość (30 dni od dodania),
  Wyprzedaż i Edycja limitowana (ustawiane ręcznie), Ostatnie sztuki (stan ≤ 3). Kolory odznak: czerwień `#a63b2b`
  dla Promocji i Wyprzedaży, `forest` dla Bestsellera, żółty klubowy dla Nowości, `ink` dla Premiery i edycji limitowanej.
- Strona produktu: galeria z lewej, panel zakupu z prawej, na telefonie jedno pod drugim; cena, rozmiary,
  dostępność, przycisk, dostawa i zwroty widoczne bez rozwijania. Informacja Omnibus pod ceną.
- Siatki: 2 kolumny na telefonie, 3-4 na desktopie, odstęp 20-24px.
- Brak dekoracyjnych linii, celowników, siatek i okręgów w tle. Zdjęcia produktu mówią same.

## 5. Zdjęcia

- Tylko prawdziwe zdjęcia produktów i klubu. Brak generowanych ilustracji i atrap.
- Gdy brak zdjęcia: neutralny kafel `paper` z napisem „Zdjęcie produktu w przygotowaniu” (`/assets/product-unavailable.svg`).
  Nie wstawiaj zdjęć zastępczych z internetu.
- Zdjęcia kibiców i hali tylko w hero i kampaniach, z ciemnieniem, żeby tekst był czytelny (WCAG AA).

## 6. Komponenty

- Warstwy CSS: `legacy` (dawne arkusze stron: zamówienie, konto, pomoc, zawodnicy, karta) < `theme` < `base` < `components` (`kit.css`, nadpisania przez `@apply`) < `utilities`.
  Nowe komponenty piszemy klasami Tailwind; starsze strony dostają wygląd zestawu przez `kit.css`, bez zmiany ich markupu.
- Przyciski: `TextureButton` (`components/templates/essentials/ui/texture-button.tsx`) dla akcji głównej (`primary`), drugorzędnej (`secondary`)
  i na ciemnym tle (`inverse`). W starszych formularzach klasa `button button-dark` ma ten sam wygląd. Jedna akcja główna w widoku, tekst do 3 słów.
- Pigułki (`rounded-full border h-9`): nawigacja kategorii, filtry, rozmiary. Stan aktywny: `bg-primary text-primary-foreground`.
- Karta produktu: zdjęcie 4:5 w `rounded-xl bg-muted`, powiększenie przy najechaniu, serce w prawym górnym rogu, odznaka-pigułka w lewym,
  przycisk „Wybierz rozmiar / Dodaj do koszyka” pojawia się na desktopie przy najechaniu, na telefonie jest widoczny stale.
- Odznaki (`.product-badge`): jedna forma pigułki, kolor mówi o rodzaju (Premiera/Przedsprzedaż zieleń, Promocja/Wyprzedaż pomarańcz,
  Edycja limitowana czerń, Nowość/Bestseller jasna zieleń, Wyprzedane/Ostatnie sztuki białe).
- Pola formularzy: `rounded-lg border-input h-11`, pierścień `ring-ring/30` w fokusie; etykieta nad polem, pomoc pod polem, błąd pod polem (`.field-error`).
- Dialogi: koszyk, menu i filtry jako szuflady z prawej (`Modal drawer`), szybki podgląd i wyszukiwarka wyśrodkowane; tło `bg-foreground/40` z rozmyciem.
- Ikony: `reicon-react` w nowych komponentach (rozmiar 14-20px), `lucide-react` w starszych widokach i panelu. Bez emoji.
- Stany: ładowanie („Sprawdzanie ceny…”), pusty (`.empty-state`: ikona, zdanie, przycisk do sklepu), błąd (zdanie, co zrobić).
- Ruch: `.animate-rise` dla treści hero (tylko gdy użytkownik nie wyłączył animacji), powiększenie zdjęć 500 ms, przejścia kolorów.

## 7. Ruch i dostępność

- Przejścia 180 ms na tło/kolor/transform. Bez animacji w pętli poza karuzelą hero, która respektuje `prefers-reduced-motion`.
- Fokus widoczny: `outline 2px forest`. Kontrast tekstu min. 4,5:1, elementów dużych 3:1.
- Wszystko działa od 320px szerokości; bez poziomego przewijania strony.

## 8. Czego nie robić (lista kontrolna przed commitem)

1. Numerowane lub wersalikowe etykiety nad sekcjami.
2. Półpauzy, pauzy, kropki środkowe w treści.
3. Dekoracje w tle: linie, okręgi, celowniki, paski haseł.
4. Trzy identyczne karty z ikonkami jako sekcja.
5. Nowe kolory, gradienty, cienie z poświatą, zaokrąglenia inne niż 3px.
6. Teksty-wypełniacze i fikcyjne liczby („99% zadowolonych klientów”).
7. Zewnętrzne fonty, skrypty i obrazy ładowane z CDN (CSP dopuszcza tylko własny host).
