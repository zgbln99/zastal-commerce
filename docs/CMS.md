# Zastal Store — CMS / Edytor strony

## Cel

Edytor pod zakładką **Panel sklepu → Edytor strony** zapisuje układ strony
głównej w bazie SQLite. Nie wymaga zmian w plikach Next.js ani pracy
programisty przy zwykłej edycji tekstów, sekcji, zdjęć, wyróżnionych produktów,
kategorii i kampanii.

W przeciwieństwie do typowego panelu ustawień edytor ma **jedno źródło prawdy**:
ten sam renderer `HomeCanvas` służy do wyświetlania opublikowanej strony oraz
prywatnego podglądu. Nie ma osobnego „obrazka podglądu”, który mógłby różnić
się od tego, co zobaczą klienci.

### Jak pracować

1. Otwórz `/admin`, zaloguj się na konto administratora i kliknij **Edytor strony**.
2. W kolumnie z lewej wybierz sekcję, ukryj ją, skopiuj, przenieś w górę/dół
   albo usuń. Przycisk **Dodaj sekcję** otwiera bibliotekę dziewięciu modułów.
3. Z prawej strony zmień nagłówki, opisy, zdjęcia, wybrane produkty, kategorie,
   liczbę kart, układ kolumn, przyciski i kolory; opcje zależą od typu sekcji.
4. Sprawdź widok desktopu i telefonu w centralnym podglądzie, który jest
   *prywatny*, a nie publiczny.
5. Kliknij **Zapisz szkic**, aby zachować pracę bez zmiany publicznej strony.
6. Kliknij **Opublikuj**, aby promować najnowszy szkic na stronę publiczną.
7. Przycisk **Historia** umożliwia wczytanie starszej wersji do szkicu.
   Przywrócenie samo w sobie **nie publikuje** zawartości.

Niezapisane edycje są odróżnione od wersji opublikowanej. Przy próbie zamknięcia
przeglądarki pojawia się ostrzeżenie o niezapisanych zmianach.

### Dostępne sekcje

| Sekcja | Możliwości |
|---|---|
| Baner główny | zdjęcie, nagłówek, nadtytuł, opis, CTA 1 i 2, linki, wysokość, przyciemnienie, wyrównanie |
| Kolekcje | kolejność i lista kategorii, nazwa, link do katalogu, kolumny |
| Produkty | kategoria, liczba pozycji, kolejność wskazanych ID, filtry, kolumny |
| Personalizacja | wybrany produkt, opis, wezwanie do działania; dostępność wynika z faktycznej konfiguracji produktu |
| Zdjęcie + produkt | zdjęcie, konkretne SKU, teksty |
| Akcesoria | wyróżnienie rzeczywistych produktów z kategorii, liczba pozycji |
| Baner kampanii | zdjęcie, tło, kolor tekstu, wyświetlany przycisk i link |
| Sekcja tekstowa | tekst, wyrównanie i kolory |
| Informacje | trzy edytowalne kafelki pomocy |

### Media i katalog

W edytorze dostępna jest biblioteka zdjęć oraz formularz dodawania nowych
JPG, PNG i WebP o maksymalnym rozmiarze 1,2 MB. Plik jest weryfikowany
i przetwarzany po stronie serwera na zoptymalizowany WebP. SVG i nieznane
formaty są odrzucane. Zdjęcia przechowywane są w katalogu `home_media/`,
ignorowanym przez Git, i wydawane przez `/api/store/media/<hash>.webp`.

Ten sam mechanizm dodawania zdjęć działa w panelu **Produkty**. Opublikowana
strona pobiera bieżące ceny i stany magazynowe z katalogu produktów — CMS
nie kopiuje cen ani nie inventuje dostępności.

**Ważne:** kopie zapasowe muszą obejmować zarówno `zastal.sqlite3`,
jak i `home_media/`. Produkcyjne pliki graficzne wymagają osobnej polityki
backupu i retencji.

### API

- `GET /api/store/home`: publiczna, wyłącznie opublikowana konfiguracja.
- `GET /api/admin/home`: szkic, numer wersji, ostatnia publikacja; administrator.
- `PATCH /api/admin/home`: zapis szkicu z `revision` dla optimistic locking.
- `POST /api/admin/home/publish`: publikacja zapisanego szkicu.
- `GET /api/admin/home/revisions`: maksymalnie 25 ostatnich zapisów.
- `POST /api/admin/home/restore`: starsza wersja jako nowy szkic.
- `GET /api/admin/home/media`: biblioteka zdjęć.
- `POST /api/admin/home/media`: upload obrazu z walidacją.
- `GET /api/store/media/<hash>.webp`: publiczne zdjęcia po bezpiecznej konwersji.

Operacje administracyjne wykorzystują działające sesje, kontrolę roli
`admin`, ochronę CSRF i historię audytu. Konkurencyjne zapisy na nieaktualnej
wersji są odrzucane kodem HTTP 409.

### Bezpieczeństwo sprzedaży

**Przycisk „Opublikuj” dotyczy tylko wyglądu i treści strony.**
Nie uruchamia zamówień ani płatności. Sprzedaż pozostaje w fazie przygotowań,
dopóki operator płatności, przesyłki i wymagane informacje prawne
nie zostaną niezależnie wdrożone i zweryfikowane.

### Kierunek dalszej rozbudowy

CMS strony głównej jest solidną podstawą, ale **nie jest jeszcze całym
ekosystemem Shopify**. Do dalszych etapów należą: edytor szablonu kart
produktów, kolekcji i menu globalnego; wiele podstron CMS; pełne zarządzanie
galerią mediów; statusy publikacji i harmonogram; SEO dla każdej treści;
uprawnienia redaktorów; wielojęzyczność; legalna sprzedaż, podatki i dostawy.
