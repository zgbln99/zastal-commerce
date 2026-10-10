# Zastal Commerce OS — demo

Oficjalnie wyglądająca koncepcja sklepu kibica Zastalu (nie jest to produkcyjny sklep klubu).

## Demo v0.1
- katalog produktów i koszyk
- testowe zamówienia i historia statusów
- stany magazynowe
- zalążek obsługi nadruków kupowanych od dostawców (transfery DTF)
- lokalne etykiety Code128/QR do magazynu (identyfikatory wewnętrzne, nie numery EAN GS1)

## Uruchomienie
```bash
python3 app.py
```
Serwer domyślnie słucha tylko na `127.0.0.1:8877`.

To **demo**, nie wdrożenie produkcyjne. Nie uruchamiaj publicznego proxy bez wdrożenia kontroli dostępu, HTTPS, zabezpieczeń API i audytu. Nie podłączaj prawdziwych płatności ani danych klientów.

## Plan
1. Sklep i projekt UX
2. Panel, magazyn i zarządzanie zamówieniami
3. Transfery DTF, produkcja na odzieży, kompletacja i etykiety
4. Aplikacja Android dla personelu
