# Zastal Store — konta i uporządkowany sklep

## Cel i upoważnienie

Użytkownik prosi o profesjonalniejszy sklep, mniej wyglądu generowanego przez AI,
konto klienta i konto administratora, „trochę jak Shopify”. Rozwijamy istniejący
własny sklep, repozytorium i wdrożenie AMS. To nie jest migracja na usługę Shopify.
Polecenie obejmuje wdrożenie poprawionej wersji. Zachowujemy bazę, bieżące
zamówienia, stany i konfigurację pozostałych aplikacji na serwerze.

## Zakres

- Produktowa strona główna, kompaktowy nagłówek z wyszukiwaniem i kontem,
  czytelna nawigacja, białe tło, małe promienie, zielony akcent klubowy.
  Prawdziwe istniejące zdjęcia produktów. Bez wymyślonych bestsellerów, ocen,
  promocji, wykresów sprzedaży i sloganów.
- Konto klienta: rejestracja, logowanie, wylogowanie, historia i szczegóły własnych
  zamówień, zmiana nazwy i hasła, wylogowanie pozostałych sesji, klucz odzyskiwania.
- Konto administratora: logowanie hasłem, trwała sesja, istniejące zamówienia,
  magazyn, zakup/przyjęcie gotowych transferów DTF, nanoszenie, etykiety i historia.
  Nowe widoki produktów (zmiana nazwy i ceny), klientów (status i ich zamówienia)
  oraz ustawień konta administratora.
- Po zalogowaniu zamówienie jest przypisane do konta na serwerze. Zakup gościnny
  pozostaje możliwy. Klient może przypisać swoje wcześniejsze zamówienie przez
  prywatny link z tokenem; nie przez sam adres e-mail ani numer zamówienia.
- Dane konta są rzeczywiście zapisywane. Płatności i dostawy nadal są testowe.
  Brak skonfigurowanej poczty: odzyskiwanie używa osobistego klucza zamiast
  fałszywego komunikatu o wysłanej wiadomości.

## Architektura i bezpieczeństwo

Istniejący Next.js + Python/SQLite. Moduł `commerce_auth.py` oddziela hasła,
sesje, walidację i limity od transakcji magazynowych. Bez nowych zależności.

- `users`: id, identifier unikalny bez wielkości liter, name, role `customer|admin`,
  password_hash, recovery_hash, active, created, updated. Publiczna rejestracja
  zawsze tworzy klienta, niezależnie od dodatkowych pól żądania.
- `auth_sessions`: hash losowego 256-bitowego tokenu, user_id nullable, csrf_token,
  created, expires. Sesje anonimowe 1 godz., klientów 7 dni, administratora 8 godz.
  Rotacja tokenu po zalogowaniu/rejestracji/zmianie hasła/odzyskaniu konta.
- Hasła: scrypt N=16384,r=8,p=5, dklen=32, losowa sól 16 bajtów.
  Hasła 12–128 znaków bez obowiązku szczególnych klas znaków.
  Proces ogranicza jednoczesne operacje scrypt i liczbę prób z adresu/konta.
- Cookie `__Host-zastal_session`: Secure, HttpOnly, SameSite=Lax, Path=/,
  bez Domain. Żaden token uwierzytelniający nie trafia do localStorage.
- POST/PATCH chronionych ścieżek wymagają `X-CSRF-Token` dla aktualnej sesji.
  Dodatkowo odrzucamy obcy Origin i Sec-Fetch-Site cross-site; przy wdrożeniu
  jawne `ZASTAL_SITE_ORIGIN` wskazuje istniejący adres HTTPS.
- Zmiana hasła wymaga obecnego hasła i unieważnia wszystkie starsze sesje.
  Nowy klucz odzyskiwania wymaga obecnego hasła. Odzyskanie wymaga poprawnego
  identyfikatora i silnego losowego klucza; klucz działa jeden raz i jest rotowany.
  Hash klucza to SHA256 (klucz losowy 256 bitów, nie hasło).
- Bootstrap tworzy konto `admin` tylko jeśli nie ma administratora. Początkowe
  hasło pochodzi z istniejącej zmiennej ZASTAL_ADMIN_TOKEN, nigdy ze źródeł ani
  odpowiedzi API. Po zmianie hasła env nie resetuje hasła. Stary Bearer nie
  uwierzytelnia już panelu ani API administratora.
- Zablokowane konta tracą sesje. API administratora sprawdza rolę na serwerze.
  Klient nie może pobrać cudzych zamówień ani zmienić własnej roli/statusu.
- Publiczne linki zamówienia nie ujawniają profilu klienta. Prywatne dane dostępne
  wyłącznie w koncie właściciela i panelu administratora.

## Kontrakt API

- GET `/api/auth/session` -> `{user: User|null, csrf_token: string}`; ustawia
  anonimową sesję, jeśli potrzebna. User={id,identifier,name,role,created}.
- POST `/api/auth/register` {email,name,password} -> 201 Session + recovery_key.
- POST `/api/auth/login` {identifier,password} -> Session (ogólny błąd dla
  błędnego/nieistniejącego/zablokowanego konta).
- POST `/api/auth/logout` -> Session z user:null, unieważnia aktualną sesję.
- POST `/api/auth/recover` {identifier,recovery_key,password} -> Session + nowy
  recovery_key; stare sesje i stary klucz są nieważne.
- PATCH `/api/account/profile` {name} -> Session. Identyfikator nie jest zmieniany
  bez weryfikacji nowego e-maila.
- POST `/api/account/password` {current_password,password} -> Session.
- POST `/api/account/recovery-key` {current_password} -> {recovery_key}.
- POST `/api/account/logout-others` -> {ok:true}.
- GET `/api/account/orders` -> tablica własnych zamówień z items i metadanymi
  dostawy; GET `/api/account/orders/:id` -> własne szczegóły z events.
- POST `/api/account/orders/claim` {id,tracking_token} -> {ok:true}; odmowa,
  jeżeli token błędny albo zamówienie przypisane do innego klienta.
- GET `/api/admin/customers` -> tablica klientów {id,identifier,name,active,
  created,order_count,order_total}; GET `/api/admin/customers/:id` -> klient
  + orders; PATCH ten sam adres {active:boolean} -> {ok:true}.
- GET `/api/admin/products` -> istniejący katalog;
  PATCH `/api/admin/products/:id` {name,price:integer groszy} -> produkt.
- Istniejące endpointy administratora zachowują odpowiedzi; uwierzytelniają się
  cookie, mutacje wymagają CSRF. Błędy auth: 401 brak sesji, 403 rola/CSRF.

## Transakcje zamówień

Tabela order_receipts dostaje nullable customer_id z FK. Stare wpisy pozostają
gościnne. Pole account_id w nowym payloadzie jest snapshotem z klienta:
null oznacza gościa; dodatnie id musi odpowiadać aktualnie zalogowanemu klientowi.
Nie pozwalamy przypisać dowolnego id. Przy pominięciu pola używamy bieżącego
klienta, jeśli zalogowany. Idempotencja obejmuje właściciela; próbę z konta można
ponowić tylko z tego samego konta. Frontend zachowuje snapshot account_id i przy
zmianie/wygaśnięciu konta prosi o zalogowanie na właściwe konto, bez kasowania
niepotwierdzonej próby. Zachowujemy pobieranie cen/dostaw na serwerze, rollback
stanów i dotychczasowe odejmowanie wyłącznie zakupionych pozycji koszyka.

## Frontend

`AuthProvider` otacza sklep i administratora: pobiera sesję, pamięta CSRF wyłącznie
w pamięci, synchronizuje zmianę konta między kartami przez BroadcastChannel,
udostępnia `request(path, options)` i `refresh()`. Każda mutacja przez wrapper
dostaje CSRF; po 401 czyści bieżącą tożsamość. AuthForm używany na /konto i /admin.
Parametr next dopuszcza tylko lokalne /sklep,/produkt,/zamowienie,/konto,/admin.
Rejestracja i odzyskanie pokazują klucz raz, z kopią/pobraniem i świadomym
przejściem dalej. Nie umieszczamy hasła ani klucza w URL lub zapisie przeglądarki.

Konto klienta: menu Zamówienia / Dane konta / Bezpieczeństwo. Szczegóły zamówienia
adresowalne /konto?order=id. Administrator ma własną powłokę i ustawienia;
klient na /admin widzi brak dostępu i powrót do konta, nigdy formularz klucza.
Operacje panelu korzystają z `request`, nie z bearer tokenu.

## Weryfikacja i wdrożenie

Testy integracyjne w izolowanej bazie: rotacja sesji, scrypt, CSRF, role,
rozróżnienie zamówień A/B/gość, bootstrap jednorazowy, logowanie błędne/limity,
blokada, hasło/recovery/logout, snapshot konta przy idempotencji, edycja produktu.
Istniejące testy koszyka, dostaw, DTF i anulowania pozostają zielone.
TypeScript i build Next w oddzielnym katalogu AMS z kopiowanymi zależnościami.
Przed wdrożeniem backup SQLite i źródeł/builda; migracja addytywna. Po restarcie
sprawdzamy istniejące dane, API, publiczny sklep, login i układy 390/768/desktop.
Synchronizacja GitHub na bieżącej gałęzi main z lease expected_sha=473c0ec.


## Rozszerzenie użytkownika: produkty meczowe i personalizacja

Użytkownik w trakcie pracy doprecyzował: przy dodawaniu produktu potrzebna jest
opcja nadruku nazwiska/numeru oraz wybór aktualnego zawodnika. Dodajemy rzeczywiste
formularze tworzenia produktu i opcje personalizacji, a nie tylko zmianę istniejącej ceny.

Produkt API ma image, subtitle, sizes, personalization_enabled, personalization_required,
personalization_fee (integer groszy). POST /api/admin/products tworzy produkt z nazwą,
SKU, kategorią (Koszulki/Bluzy/Dzieci/Akcesoria), ceną, stock (0–100000), opcjonalnym
zdjęciem (HTTPS bez danych logowania lub lokalny /assets/), opisem oraz powyższymi
opcjami. Warianty i EAN są generowane transakcyjnie jak dotychczas. Nie tworzymy
fikcyjnego produktu meczowego w bazie ani nie włączamy nadruku na zwykłych koszulkach
bez oznaczenia administratora. Formularz dodawania pozwala to zrobić od razu.

GET /api/players -> {players:[{id,name,print_name,number}],source_url,verified_at}.
GET /api/admin/players zwraca także nieaktywnych. POST/PATCH /api/admin/players[/id]
pozwalają dodać lub zmienić zawodnika i wyłączyć go z bieżącej listy. Lista początkowa
według oficjalnej kadry basketzg.pl/players, sprawdzona 2026-10-10: Galewski 1,
Mazurczak 3, Garrison 0, Matczak 8, Majewski 6, Denis 9, White 13, Solomon 2,
Beech 22, Wójcik 25, Sulima 7, Brkić 21. Numery są stringami; 0 i 00 są poprawne.
Dane początkowe wchodzą tylko do pustej tabeli, restart nie nadpisuje edycji.

Pozycja koszyka i payload zamówienia może mieć personalization:
{mode:'player',player_id:number} albo {mode:'custom',name:string,number:string}.
Nazwisko własne normalizowane do wielkich liter; 1–20 znaków (litery Unicode,
znaki diakrytyczne, spacje, apostrof, kropka i myślnik). Numer to 1–2 cyfry ASCII.
API odrzuca nadruk przy wyłączonej personalizacji, brak wymaganego nadruku,
nieaktywnego zawodnika i niepoprawne dane. Dane zawodnika i opłata pochodzą z serwera.
Order items mają snapshot personalization {mode,player_id?,name,number},
base_unit_price, personalization_fee; unit_price obejmuje nadruk. Późniejsza zmiana
listy/nazw/cen nie zmienia zapisanych zamówień. Idempotencja rozróżnia nadruki,
a ponowienie dokładnego żądania zwraca wcześniejszy snapshot nawet po zmianie listy.

Różne nadruki na tym samym SKU/rozmiarze są osobnymi pozycjami koszyka.
Dostępność sumuje ilość wariantu bez względu na nadruk; usuwanie zakupionych pozycji
zachowuje inne nadruki. Personalizacja jest widoczna w koszyku, podsumowaniu,
potwierdzeniu, historii klienta i szczegółach zamówienia/nanoszeniu w panelu.
Nowe produkty z API muszą być widoczne w katalogu i na dynamicznej stronie produktu.
Brak zdjęcia ma uczciwy neutralny placeholder. Dane produktu nie są hardkodowane.
