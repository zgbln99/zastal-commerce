# Zastal Store — galerie produktów i kampanie

Rozbudowa wersji 0.8 działającej na AMS863260. Użytkownik autoryzował implementację, publikację w zgbln99/zastal-commerce i wdrożenie pod obecnym publicznym adresem.

## Zachowanie danych i zabezpieczeń

Migracje są wyłącznie addytywne. Zachować istniejące produkty, ceny, zapasy, warianty, zamówienia, konta, sesje, nadruki, zawodników, opublikowany CMS, szkic i historię CMS oraz pliki home_media. Nie zmieniać hasła ani blokady prelaunch. Zachować wymagania administratora, origin, CSRF i limity przesyłania. Produkcja nie używa ZASTAL_TEST_MODE. Weryfikacja integracyjna pracuje na odizolowanych bazach tymczasowych.

## Galerie

Każdy produkt ma uporządkowaną galerię maksymalnie 20 elementów. Element: id, url, role (packshot/model/detail/lifestyle), alt, illustrative (bool) i source_url (opcjonalny publiczny adres źródła). Pierwszy element jest okładką; usunięcie galerii przywraca dotychczasowy pojedynczy obraz. Dotychczasowy rekord produktu pozostaje niezmieniony. Brak galerii daje pojedynczy obraz dotychczasowy, z ostrożnym oznaczeniem poglądowym do czasu weryfikacji. Produkt bez obrazu używa istniejącego placeholdera, bez zmyślonych fotografii.

Administrator przesyła wiele zdjęć poprzez obecną walidację obrazów Pillow; pliki są pozbawiane metadanych i zapisywane jako WebP. Może ustawić role, alt, status poglądowy, kolejność i usunąć powiązanie. Nowy obraz jest domyślnie poglądowy, dopóki administrator nie potwierdzi zgodności z produktem. Zapis galerii jest atomowy, wersjonowany i chroni przed nadpisaniem równoległych zmian. Plików źródłowych i historii nie usuwa się. Galerie można dodać także podczas tworzenia produktu; częściowe błędy nie mogą tworzyć duplikatów produktu ani po cichu gubić zdjęć.

Katalog zmienia okładkę po hover/focus na drugie zdjęcie (preferuje rzeczywiste zdjęcie modelowe/lifestyle). Karta produktu ma miniatury, przewijanie zdjęć, klawiaturę, gest poziomy na telefonie i powiększenie z aktualnym zdjęciem oraz przełączaniem. Zabezpieczenie przed myleniem zwykłego scrolla z gestem. Istniejący koszyk, nadruki, ulubione i dostępność działają bez zmian. Oznaczenie „Materiał poglądowy” jest widoczne przy aktualnym obrazie.

## Kampanie CMS

Rozszerzyć istniejący CMS o typ campaign. Pola: eyebrow, title, description, image, image_alt, image_role (model/lifestyle), image_illustrative, product_ids (CSV), cta_text, cta_url, alignment. Wybór zdjęć model/lifestyle z galerii powiązanych produktów kopiuje ich alt i status poglądowy; alternatywnie upload i jawne potwierdzenie zgodności. Kampania ma duże zdjęcie i powiązane produkty oraz widoczne oznaczenie materiału poglądowego. Używa dotychczasowego szkicu, podglądu, publikacji i historii. Stare konfiguracje pozostają ważne i nie są automatycznie przepisywane. Aktywna kampania wymaga zdjęcia i istniejących powiązanych produktów; nieaktywna może być przygotowanym pustym szkicem.

## Materiały

Wyłącznie materiały potwierdzone dla tego samego produktu, koloru i wzoru. Oficjalny mockup nadal jest materiałem poglądowym. Nie używać odzieży z innego sezonu/wzoru jako fotografii produktu, generowanych modeli ani fałszywych zdjęć. Jeśli dostawca nie udostępnia zdjęć na modelach/detali/lifestyle, przygotować pełną obsługę, ale nie zapełniać tych ról niezgodnymi plikami. Podać tę lukę użytkownikowi. Dodatkowe prawdziwe zdjęcia dopuszczone przez kontrolę źródeł mogą zasilić nowe galerie bez zmiany istniejących rekordów. Zapisać źródła i klasyfikację w wersjonowanym manifeście.

## Wdrożenie i dowód

Przed wdrożeniem kopia SQLite przez backup API, kodu, builda, runtime i home_media. Zbudować wydanie poza działającym katalogiem, testować migrację kopii bazy i porównać stare tabele. Publikacja GitHub z oczekiwanym aktualnym HEAD, bez force. Wdrożyć na AMS863260, sprawdzić zdrowie usług, publiczny URL, desktop i mobile, galerię, hover, miniatury, zoom i oznaczenia. Zachować publiczną blokadę sprzedaży i rejestracji. Dowód przeglądarkowy z rzeczywistej opublikowanej strony.
