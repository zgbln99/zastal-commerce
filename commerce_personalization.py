"""Additive product metadata, editable official roster and shirt print validation.

Request identity is normalized without reading mutable catalog/roster rows. Live
validation and snapshots happen only after a matching receipt retry is checked.
"""
import re
import unicodedata
from urllib.parse import urlparse

SOURCE_URL = 'https://basketzg.pl/players'
VERIFIED_AT = '2026-10-10'
CATEGORIES = ('Koszulki', 'Bluzy', 'Dzieci', 'Akcesoria')
DEFAULT_OPTIONS = {'image': '', 'subtitle': '', 'personalization_enabled': False,
                   'personalization_required': False, 'personalization_fee': 0}
ROSTER = (
    ('Kuba Galewski', 'GALEWSKI', '1'), ('Andrzej Mazurczak', 'MAZURCZAK', '3'),
    ('Conley Garrison', 'GARRISON', '0'), ('Filip Matczak', 'MATCZAK', '8'),
    ('Miłosz Majewski', 'MAJEWSKI', '6'), ('Gauthier Denis', 'DENIS', '9'),
    ('Trazarien White', 'WHITE', '13'), ('Tay Solomon', 'SOLOMON', '2'),
    ('Beau Beech', 'BEECH', '22'), ('Jan Wójcik', 'WÓJCIK', '25'),
    ('Krzysztof Sulima', 'SULIMA', '7'), ('Veljko Brkić', 'BRKIĆ', '21'),
)


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS product_options(
            product_id INTEGER PRIMARY KEY REFERENCES products(id),
            image TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '',
            personalization_enabled INTEGER NOT NULL DEFAULT 0 CHECK(personalization_enabled IN (0,1)),
            personalization_required INTEGER NOT NULL DEFAULT 0 CHECK(personalization_required IN (0,1)),
            personalization_fee INTEGER NOT NULL DEFAULT 0 CHECK(personalization_fee >= 0));
        CREATE TABLE IF NOT EXISTS players(
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            print_name TEXT NOT NULL, number TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
        CREATE TABLE IF NOT EXISTS commerce_migrations(name TEXT PRIMARY KEY);
    ''')
    if not c.execute("SELECT 1 FROM commerce_migrations WHERE name='official-roster-2026-10-10'").fetchone():
        if not c.execute('SELECT 1 FROM players LIMIT 1').fetchone():
            c.executemany('INSERT INTO players(name,print_name,number) VALUES(?,?,?)', ROSTER)
        c.execute("INSERT INTO commerce_migrations(name) VALUES('official-roster-2026-10-10')")


def text(value, label, maximum, empty=False):
    if not isinstance(value, str) or any(unicodedata.category(ch).startswith('C') for ch in value):
        raise ValueError('Nieprawidłowe pole: ' + label)
    value = value.strip()
    if not (0 if empty else 1) <= len(value) <= maximum:
        raise ValueError('Nieprawidłowa długość pola: ' + label)
    return value


def integer(value, label, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError('Nieprawidłowe pole: ' + label)
    return value


def flag(value, label):
    if not isinstance(value, bool):
        raise ValueError('Nieprawidłowe pole: ' + label)
    return value


def image_value(value):
    value = text(value, 'zdjęcie', 2048, empty=True)
    if not value:
        return value
    if any(ch.isspace() for ch in value) or '\\' in value:
        raise ValueError('Nieprawidłowy adres zdjęcia')
    if value.startswith('/assets/'):
        if not re.fullmatch(r'/assets/[A-Za-z0-9_./-]+', value) or any(part in ('', '.', '..') for part in value[8:].split('/')):
            raise ValueError('Nieprawidłowy adres zdjęcia')
        return value
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None or parsed.password is not None:
        raise ValueError('Zdjęcie wymaga HTTPS bez danych logowania lub ścieżki /assets/')
    # Accessing port also rejects malformed ports and bracketed hostnames.
    parsed.port
    return value


def product_options(c, pid):
    row = c.execute('SELECT * FROM product_options WHERE product_id=?', (pid,)).fetchone()
    if not row:
        return dict(DEFAULT_OPTIONS)
    value = {key: row[key] for key in DEFAULT_OPTIONS}
    for key in ('personalization_enabled', 'personalization_required'):
        value[key] = bool(value[key])
    return value


def validate_product(data, existing=None):
    """Create all fields, or patch supplied metadata without redefining variants."""
    values = dict(existing or {})
    if existing is None:
        values.update(DEFAULT_OPTIONS)
        for key in ('name', 'sku', 'category', 'price', 'stock'):
            if key not in data:
                raise ValueError('Brak pola produktu: ' + key)
    elif not data or not any(key in data for key in ('name', 'price', *DEFAULT_OPTIONS)):
        raise ValueError('Podaj dane produktu do zmiany')
    if existing is not None:
        for key in ('sku', 'category', 'stock'):
            if key in data and (data[key] != existing[key] or type(data[key]) is not type(existing[key])):
                raise ValueError('SKU, kategorię i stan istniejącego produktu zmieniaj przez obsługę wariantów')
    values.update({key: data[key] for key in ('name', 'sku', 'category', 'price', 'stock', *DEFAULT_OPTIONS) if key in data})
    values['name'] = text(values['name'], 'nazwa', 80)
    values['sku'] = text(values['sku'], 'SKU', 64)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', values['sku']):
        raise ValueError('SKU może zawierać litery ASCII, cyfry, myślnik i podkreślenie')
    if not isinstance(values['category'], str) or values['category'] not in CATEGORIES:
        raise ValueError('Wybierz kategorię produktu')
    values['price'] = integer(values['price'], 'cena w groszach', 1, 10000000)
    values['stock'] = integer(values['stock'], 'stan', 0, 100000)
    values['image'] = image_value(values['image'])
    values['subtitle'] = text(values['subtitle'], 'opis', 300, empty=True)
    for key in ('personalization_enabled', 'personalization_required'):
        values[key] = flag(values[key], key)
    values['personalization_fee'] = integer(values['personalization_fee'], 'opłata za nadruk', 0, 10000000)
    if values['personalization_required'] and not values['personalization_enabled']:
        raise ValueError('Wymagany nadruk musi być włączony')
    return values


def save_options(c, pid, value):
    c.execute('''INSERT INTO product_options(product_id,image,subtitle,personalization_enabled,personalization_required,personalization_fee)
        VALUES(?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET
        image=excluded.image,subtitle=excluded.subtitle,
        personalization_enabled=excluded.personalization_enabled,
        personalization_required=excluded.personalization_required,
        personalization_fee=excluded.personalization_fee''',
        (pid, *(value[key] for key in DEFAULT_OPTIONS)))


def print_name(value):
    # Check controls before stripping; embedded newlines must never become spaces.
    value = text(value, 'nazwisko na nadruku', 40)
    value = unicodedata.normalize('NFC', unicodedata.normalize('NFC', value).upper())
    if not 1 <= len(value) <= 20 or not any(unicodedata.category(ch).startswith('L') for ch in value):
        raise ValueError('Nazwisko na nadruku musi mieć 1–20 znaków i zawierać literę')
    if any(not (unicodedata.category(ch)[0] in ('L', 'M') or ch in " '.-’") for ch in value):
        raise ValueError('Nazwisko zawiera niedozwolone znaki')
    return value


def print_number(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{1,2}', value):
        raise ValueError('Numer na nadruku musi mieć 1–2 cyfry ASCII')
    return value


def normalize_request(value):
    if not isinstance(value, dict):
        raise ValueError('Nieprawidłowa personalizacja')
    if value.get('mode') == 'player':
        return {'mode': 'player', 'player_id': integer(value.get('player_id'), 'zawodnik', 1, 2147483647)}
    if value.get('mode') == 'custom':
        return {'mode': 'custom', 'name': print_name(value.get('name')), 'number': print_number(value.get('number'))}
    raise ValueError('Wybierz zawodnika lub własny nadruk')


def snapshot(c, product_id, requested):
    options = product_options(c, product_id)
    if requested is None:
        if options['personalization_required']:
            raise ValueError('Ten produkt wymaga personalizacji')
        return None, 0
    if not options['personalization_enabled']:
        raise ValueError('Ten produkt nie ma włączonej personalizacji')
    if requested['mode'] == 'player':
        player = c.execute('SELECT * FROM players WHERE id=? AND active=1', (requested['player_id'],)).fetchone()
        if not player:
            raise ValueError('Wybierz aktywnego zawodnika')
        value = {'mode': 'player', 'player_id': player['id'], 'name': player['print_name'], 'number': player['number']}
    else:
        value = dict(requested)
    return value, options['personalization_fee']


def player_value(data, existing=None):
    values = {'active': True, **dict(existing or {}), **data}
    if existing is not None and not any(key in data for key in ('name', 'print_name', 'number', 'active')):
        raise ValueError('Podaj dane zawodnika do zmiany')
    return {'name': text(values.get('name'), 'imię i nazwisko zawodnika', 80),
            'print_name': print_name(values.get('print_name')), 'number': print_number(values.get('number')),
            'active': flag(values['active'], 'aktywny zawodnik')}


def player_public(row, admin=False):
    value = {key: row[key] for key in ('id', 'name', 'print_name', 'number')}
    if admin:
        value['active'] = bool(row['active'])
    return value


def roster(c, admin=False):
    query = 'SELECT * FROM players' + ('' if admin else ' WHERE active=1') + ' ORDER BY id'
    return {'players': [player_public(row, admin) for row in c.execute(query)],
            'source_url': SOURCE_URL, 'verified_at': VERIFIED_AT}
