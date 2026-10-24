"""Editable information pages (regulamin, polityka prywatności, zwroty, dostawa, kontakt...).

Each page has a private draft and a published version. Content is a restricted
plain-text format (headings, paragraphs, lists, https links) rendered safely by
the storefront; HTML is never stored or emitted. Seeded drafts are skeletons
with explicit placeholders and are NOT published: legal texts must be approved
by the seller and a lawyer before publishing.
"""
import datetime as dt
import re

SLUG = re.compile(r'[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?')
MAX_PAGES = 20
MAX_CONTENT = 60000
SEEDS = {
    'regulamin': ('Regulamin sklepu', '''# Regulamin sklepu internetowego Zastal Store

[UZUPEŁNIJ: tekst zatwierdzony przez sprzedawcę i prawnika. Szkic nie jest publikowany automatycznie.]

## 1. Sprzedawca
Sklep prowadzi: [NAZWA PODMIOTU], [ADRES], NIP [NIP], KRS/CEIDG [NUMER], e-mail: [E-MAIL], tel.: [TELEFON].

## 2. Składanie zamówień
- Ceny są cenami brutto w złotych polskich i zawierają podatek VAT.
- Zamówienie składa się przez koszyk; przyjęcie do realizacji potwierdzamy e-mailem.
- Produkty personalizowane (nazwisko, numer) są wykonywane według specyfikacji klienta.

## 3. Płatności
- Płatność online (PayU), przelew tradycyjny lub płatność przy odbiorze osobistym.
- Zamówienie nieopłacone w ciągu [LICZBA] godzin jest anulowane.

## 4. Dostawa
- [METODY DOSTAWY, KOSZTY I TERMINY — zgodnie z panelem Sprzedaż i dostawy]

## 5. Odstąpienie od umowy
- Konsument ma prawo odstąpić od umowy w terminie 14 dni bez podania przyczyny, z wyjątkami ustawowymi (m.in. rzeczy wyprodukowane według specyfikacji konsumenta).

## 6. Reklamacje
- Reklamacje rozpatrujemy w terminie 14 dni. [PROCEDURA]

## 7. Dane osobowe
- Zasady przetwarzania danych opisuje Polityka prywatności.
'''),
    'polityka-prywatnosci': ('Polityka prywatności', '''# Polityka prywatności

[UZUPEŁNIJ: administrator danych, podstawy prawne, okresy retencji, odbiorcy (operator płatności, przewoźnik, dostawca poczty), prawa osób, kontakt IOD jeśli dotyczy.]

## Administrator danych
[NAZWA PODMIOTU], [ADRES], e-mail: [E-MAIL].

## Cele i podstawy przetwarzania
- Realizacja zamówienia i umowy sprzedaży (art. 6 ust. 1 lit. b RODO).
- Obowiązki podatkowe i rachunkowe (art. 6 ust. 1 lit. c RODO).
- Obsługa reklamacji i zwrotów (art. 6 ust. 1 lit. b i f RODO).
- Marketing za zgodą (art. 6 ust. 1 lit. a RODO) — zgoda jest dobrowolna i może być wycofana.

## Odbiorcy danych
- Operator płatności PayU S.A., przewoźnicy, dostawca usług e-mail, hosting.

## Prawa
- Dostęp, sprostowanie, usunięcie, ograniczenie, przenoszenie, sprzeciw, skarga do PUODO.
'''),
    'zwroty': ('Zwroty i reklamacje', '''# Zwroty i reklamacje

[UZUPEŁNIJ i zatwierdź. Formularz zgłoszenia jest dostępny na stronie zamówienia i w koncie klienta.]

## Odstąpienie od umowy (14 dni)
- Zgłoś zwrot na stronie zamówienia lub w koncie klienta, a następnie odeślij produkt na adres: [ADRES ZWROTÓW].
- Zwrot środków następuje tą samą metodą płatności w terminie do 14 dni od otrzymania towaru.
- Produkty personalizowane nazwiskiem i numerem są wykonywane na indywidualne zamówienie i nie podlegają zwrotowi, chyba że są wadliwe.

## Reklamacje
- Reklamację wady zgłoś w ten sam sposób, opisując problem i dołączając zdjęcia, jeśli to możliwe.
- Odpowiadamy w ciągu 14 dni.
'''),
    'dostawa': ('Dostawa i odbiór osobisty', '''# Dostawa i odbiór osobisty

[UZUPEŁNIJ zgodnie z cennikiem w panelu Sprzedaż i dostawy.]

## Odbiór osobisty
- [ADRES PUNKTU], [GODZINY].

## Wysyłka
- Automat paczkowy: [CENA], czas [DNI].
- Kurier: [CENA], czas [DNI].
- Zamówienia z personalizacją wysyłamy po wykonaniu nadruku: [CZAS].
'''),
    'kontakt': ('Kontakt', '''# Kontakt

[NAZWA PODMIOTU]
[ADRES]
e-mail: [E-MAIL] · tel.: [TELEFON]

Godziny obsługi: [GODZINY]
'''),
}


class PageError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status, self.code = status, code


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.execute('''CREATE TABLE IF NOT EXISTS site_pages(
        slug TEXT PRIMARY KEY, title TEXT NOT NULL, draft TEXT NOT NULL DEFAULT '', published TEXT NOT NULL DEFAULT '',
        published_title TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER NOT NULL DEFAULT 0,
        updated TEXT NOT NULL, published_at TEXT, sort INTEGER NOT NULL DEFAULT 100)''')
    if not c.execute('SELECT 1 FROM site_pages LIMIT 1').fetchone():
        for order, (slug, (title, content)) in enumerate(SEEDS.items(), 1):
            c.execute('INSERT INTO site_pages(slug,title,draft,updated,sort) VALUES(?,?,?,?,?)', (slug, title, content, stamp(), order * 10))


def _slug(value):
    if not isinstance(value, str) or not SLUG.fullmatch(value):
        raise PageError(400, 'Adres strony: małe litery, cyfry i myślniki (2–60 znaków)')
    return value


def _content(value):
    if not isinstance(value, str) or len(value) > MAX_CONTENT or any(ord(ch) < 32 and ch not in '\n\t' for ch in value):
        raise PageError(400, 'Nieprawidłowa treść strony (maks. 60 000 znaków, bez znaków sterujących)')
    if re.search(r'<\s*/?\s*[a-zA-Z]', value):
        raise PageError(400, 'Treść nie może zawierać znaczników HTML; użyj nagłówków #, list - i linków [tekst](https://…)')
    return value.replace('\r\n', '\n').strip('\n')


def _title(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 120 or any(ord(ch) < 32 for ch in value):
        raise PageError(400, 'Tytuł: 1–120 znaków')
    return value.strip()


def _row(row, admin=False):
    value = {'slug': row['slug'], 'title': row['title'], 'published': bool(row['published']), 'published_title': row['published_title'],
             'published_revision': row['published_revision'], 'published_at': row['published_at'], 'sort': row['sort']}
    if admin:
        value.update({'draft': row['draft'], 'revision': row['revision'], 'updated': row['updated'],
                      'draft_changed': row['draft'] != row['published'] or row['title'] != row['published_title'],
                      'placeholders': len(re.findall(r'\[[^\]\n]{1,80}\](?!\()', row['draft']))})
    return value


def listing(c, admin=False):
    rows = c.execute('SELECT * FROM site_pages ORDER BY sort,slug').fetchall()
    return [_row(row, admin) for row in rows if admin or row['published']]


def public_page(c, slug):
    row = c.execute("SELECT * FROM site_pages WHERE slug=? AND published!=''", (_slug(slug),)).fetchone()
    if not row:
        raise PageError(404, 'Nie znaleziono strony', 'page_not_found')
    return {'slug': row['slug'], 'title': row['published_title'] or row['title'], 'content': row['published'], 'published_at': row['published_at']}


def admin_page(c, slug):
    row = c.execute('SELECT * FROM site_pages WHERE slug=?', (_slug(slug),)).fetchone()
    if not row:
        raise PageError(404, 'Nie znaleziono strony', 'page_not_found')
    value = _row(row, admin=True)
    value['published_content'] = row['published']
    return value


def save_draft(c, slug, data):
    slug = _slug(slug)
    if not isinstance(data, dict):
        raise PageError(400, 'Oczekiwano danych strony')
    row = c.execute('SELECT * FROM site_pages WHERE slug=?', (slug,)).fetchone()
    title = _title(data.get('title', row['title'] if row else ''))
    content = _content(data.get('content', row['draft'] if row else ''))
    sort = data.get('sort', row['sort'] if row else 100)
    if isinstance(sort, bool) or not isinstance(sort, int) or not 0 <= sort <= 1000:
        raise PageError(400, 'Kolejność: liczba 0–1000')
    now = stamp()
    if row:
        expected = data.get('revision')
        if expected is not None and expected != row['revision']:
            raise PageError(409, 'Strona została zmieniona w innym oknie. Odśwież edytor.', 'stale_revision')
        c.execute('UPDATE site_pages SET title=?,draft=?,sort=?,revision=revision+1,updated=? WHERE slug=?', (title, content, sort, now, slug))
    else:
        if c.execute('SELECT COUNT(*) FROM site_pages').fetchone()[0] >= MAX_PAGES:
            raise PageError(400, f'Maksymalnie {MAX_PAGES} stron informacyjnych')
        c.execute('INSERT INTO site_pages(slug,title,draft,updated,sort) VALUES(?,?,?,?,?)', (slug, title, content, now, sort))
    return admin_page(c, slug)


def publish(c, slug, data=None):
    slug = _slug(slug)
    row = c.execute('SELECT * FROM site_pages WHERE slug=?', (slug,)).fetchone()
    if not row:
        raise PageError(404, 'Nie znaleziono strony', 'page_not_found')
    if isinstance(data, dict) and data.get('revision') is not None and data['revision'] != row['revision']:
        raise PageError(409, 'Szkic zmienił się od ostatniego odczytu. Odśwież edytor.', 'stale_revision')
    if not row['draft'].strip():
        raise PageError(400, 'Nie można opublikować pustej strony')
    if not (isinstance(data, dict) and data.get('confirm_reviewed') is True):
        raise PageError(400, 'Potwierdź, że treść została sprawdzona i zatwierdzona przed publikacją', 'review_required')
    c.execute("UPDATE site_pages SET published=draft,published_title=title,published_revision=revision,published_at=? WHERE slug=?", (stamp(), slug))
    return admin_page(c, slug)


def unpublish(c, slug):
    slug = _slug(slug)
    if not c.execute('SELECT 1 FROM site_pages WHERE slug=?', (slug,)).fetchone():
        raise PageError(404, 'Nie znaleziono strony', 'page_not_found')
    c.execute("UPDATE site_pages SET published='',published_title='',published_revision=0,published_at=NULL WHERE slug=?", (slug,))
    return admin_page(c, slug)
