# Skrzynka testowa Zastal Store

Na AMS działa Mailpit v1.27.4. SMTP i UI nasłuchują tylko na 127.0.0.1 (1025 i 8025). Nginx udostępnia UI pod `/poczta/` przez HTTPS, a Mailpit wymaga osobnego hasła. Testowy adres to `test@zastal.test`. Hasło przechowujemy poza repozytorium w `/var/lib/sentinelx/uploads/zastal-mailpit/auth` (hash). Baza wiadomości jest w tym samym prywatnym katalogu.

Aplikacja używa `ZASTAL_SMTP_TLS=none` wyłącznie dla serwera na loopback. To lokalny odbiornik testowy: status `sent` w kolejce oznacza przyjęcie przez Mailpit, nie doręczenie prawdziwemu odbiorcy. Przed uruchomieniem sprzedaży trzeba podłączyć zewnętrzny SMTP z TLS i prawdziwą domenę nadawcy. Nigdy nie przekazywać prawdziwych wiadomości klientów do tej skrzynki testowej.

Konto klienta `test@zastal.test` i demonstracyjne zamówienie #5 służą do sprawdzenia weryfikacji adresu i statusów. Zamówienie ma tryb `test`, nie przyjmuje płatności i nie jest realizowane. Dane logowania do UI i konta klienta nie są zapisane w repozytorium.
