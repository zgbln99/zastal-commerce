# DESIGN.md: Zastal Store

Zasady wyglądu oficjalnego sklepu Zastalu Zielona Góry. Plik jest dla ludzi i dla agentów AI,
które zmieniają `storefront/`. Zmiana, która łamie te zasady, nie jest „ulepszeniem”.

## 1. Czym jest ten sklep

Sklep kibica klubu koszykarskiego: koszulki, bluzy, akcesoria, nadruk z nazwiskiem i numerem.
Ma wyglądać jak sklep zespołu sportowego i marki streetwear, nie jak szablon SaaS.
Klient kupuje na telefonie, często z trybun. Priorytet: zdjęcie produktu, cena, rozmiar, przycisk „Dodaj do koszyka”.

## 2. Tokeny

```yaml
colors:
  forest: "#174c37"   # kolor klubu; przyciski główne, aktywne stany, stopka
  ink: "#18211e"      # tekst
  muted: "#68736d"    # tekst pomocniczy, etykiety
  line: "#e4e7e2"     # linie podziału, obramowania pól
  paper: "#f6f7f3"    # tła sekcji i kafli produktów
  accent: "#e6bf45"   # żółty klubowy; tylko drobne akcenty (odznaki), nigdy tła sekcji
typography:
  display: "Barlow Semi Condensed 600/700 (self-hosted, OFL)"  # nagłówki h1-h3, ceny
  body: "Inter 400-800 (self-hosted)"                            # treść, formularze, nawigacja
  body_size: 14px
  h1: "clamp(41px, 4.4vw, 61px)"; hero "clamp(46px, 5.6vw, 80px)"
  h2: 28-40px zależnie od sekcji
radius: 3px   # jeden promień dla przycisków, pól i kafli; brak pigułek
spacing: 8px grid; sekcje strony głównej 56-96px odstępu
container: max 1336px, 44px marginesu bocznego na desktopie, 16px na telefonie
touch: min 44px wysokości dla przycisków i pól
```

Jeden kolor akcentu na stronie. Nie wprowadzaj fioletów, gradientów, neonów ani poświaty.
Cienie tylko w modalach i menu, delikatne, w odcieniu tła.

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
  Odznaki na zdjęciu tylko ze znaczeniem („Przedsprzedaż”, „Retro”, „Ostatnie sztuki”).
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

- Przyciski: `button-dark` (forest, biały tekst) dla akcji głównej, `button-outline` dla drugorzędnej. Jedna akcja główna w widoku.
  Tekst przycisku w jednej linii, do 3 słów. Ten sam zamiar = ta sama etykieta w całym sklepie.
- Pola formularzy: etykieta nad polem, pomoc pod polem, błąd pod polem czerwonym `#a63b2b`. Bez placeholderów jako etykiet.
- Ikony: tylko `lucide-react`, `strokeWidth` 1.4-1.8, rozmiar 15-21px. Bez emoji.
- Stany: ładowanie (szkielet lub „Sprawdzanie ceny…”), pusty (zdanie + link do sklepu), błąd (zdanie, co zrobić).

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
