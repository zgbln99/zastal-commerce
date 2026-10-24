"""Additive product metadata, editable official roster and shirt print validation.

Request identity is normalized without reading mutable catalog/roster rows. Live
validation and snapshots happen only after a matching receipt retry is checked.
"""
import json
import re
import unicodedata
from urllib.parse import urlparse

SOURCE_URL = 'https://basketzg.pl/players'
VERIFIED_AT = '2026-10-10'
CATEGORIES = ('Koszulki', 'Bluzy', 'Dzieci', 'Akcesoria')
# Decoration methods the club can actually execute. DTF uses purchased finished transfers.
DECORATION_METHODS = {'dtf': 'Nadruk DTF', 'haft': 'Haft', 'haft_3d': 'Haft wypukły (3D)',
                      'sitodruk': 'Sitodruk', 'inne': 'Inna metoda (opis w notatce)'}
PRINT_FONTS = ('block', 'condensed', 'rounded')
LAYOUT_AREAS = ('name', 'number')
DEFAULT_OPTIONS = {'image': '', 'subtitle': '', 'personalization_enabled': False,
                   'personalization_required': False, 'personalization_fee': 0,
                   'decoration_method': 'dtf', 'preorder': False, 'preorder_note': '', 'preorder_until': '',
                   'size_guide': '', 'print_layout': None, 'description': '', 'badge': '', 'release_at': '', 'created_at': '', 'gift_card': False, 'pos_quick': False}
EXTENDED_COLUMNS = {'decoration_method': "TEXT NOT NULL DEFAULT 'dtf'", 'preorder': 'INTEGER NOT NULL DEFAULT 0',
                    'preorder_note': "TEXT NOT NULL DEFAULT ''", 'preorder_until': "TEXT NOT NULL DEFAULT ''",
                    'size_guide': "TEXT NOT NULL DEFAULT ''", 'print_layout': "TEXT NOT NULL DEFAULT ''",
                    'description': "TEXT NOT NULL DEFAULT ''", 'badge': "TEXT NOT NULL DEFAULT ''", 'release_at': "TEXT NOT NULL DEFAULT ''", 'created_at': "TEXT NOT NULL DEFAULT ''", 'gift_card': 'INTEGER NOT NULL DEFAULT 0', 'pos_quick': 'INTEGER NOT NULL DEFAULT 0'}
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
    present = {row['name'] for row in c.execute('PRAGMA table_info(product_options)')}
    for column, definition in EXTENDED_COLUMNS.items():
        if column not in present:
            c.execute(f'ALTER TABLE product_options ADD COLUMN {column} {definition}')
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
    if value.startswith('/api/store/media/'):
        if not re.fullmatch(r'/api/store/media/[0-9a-f]{32}\.webp',value):
            raise ValueError('Nieprawidłowy obraz z biblioteki mediów')
        return value
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
    for key in ('personalization_enabled', 'personalization_required', 'preorder', 'gift_card', 'pos_quick'):
        value[key] = bool(value[key])
    try:
        value['print_layout'] = json.loads(row['print_layout']) if row['print_layout'] else None
    except ValueError:
        value['print_layout'] = None
    value['decoration_method_label'] = DECORATION_METHODS.get(value['decoration_method'], value['decoration_method'])
    return value


def layout_value(value):
    """Mockup image plus percentage boxes for name and number; immutable copy is stored per order line."""
    if value is None or value == '' or value == {}:
        return None
    if not isinstance(value, dict) or set(value) - {'image', 'areas', 'color', 'font', 'calibrated', 'note'}:
        raise ValueError('Nieprawidłowy układ nadruku')
    image = image_value(value.get('image', ''))
    if not image:
        raise ValueError('Układ nadruku wymaga zdjęcia produktu (mockupu)')
    areas_raw = value.get('areas')
    if not isinstance(areas_raw, dict) or set(areas_raw) - set(LAYOUT_AREAS) or not areas_raw:
        raise ValueError('Układ nadruku: podaj pole nazwiska i/lub numeru')
    areas = {}
    for key, box in areas_raw.items():
        if not isinstance(box, dict) or set(box) != {'x', 'y', 'w', 'h'}:
            raise ValueError('Pole nadruku wymaga współrzędnych x, y, w, h')
        clean = {}
        for axis in ('x', 'y', 'w', 'h'):
            number = box[axis]
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not 0 <= number <= 100:
                raise ValueError('Współrzędne pola nadruku podaj w procentach 0–100')
            clean[axis] = round(float(number), 2)
        if clean['w'] < 2 or clean['h'] < 1 or clean['x'] + clean['w'] > 100 or clean['y'] + clean['h'] > 100:
            raise ValueError('Pole nadruku musi mieścić się na zdjęciu')
        areas[key] = clean
    color = value.get('color', '#ffffff')
    if not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        raise ValueError('Kolor nadruku w formacie #rrggbb')
    font = value.get('font', 'block')
    if font not in PRINT_FONTS:
        raise ValueError('Nieznany krój nadruku')
    calibrated = value.get('calibrated', False)
    if not isinstance(calibrated, bool):
        raise ValueError('Kalibracja musi być wartością logiczną')
    note = text(value.get('note', ''), 'uwaga do układu', 200, empty=True)
    return {'image': image, 'areas': areas, 'color': color.lower(), 'font': font, 'calibrated': calibrated, 'note': note}


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
    if values['decoration_method'] not in DECORATION_METHODS:
        raise ValueError('Wybierz metodę znakowania')
    values['preorder'] = flag(values['preorder'], 'przedsprzedaż')
    values['preorder_note'] = text(values['preorder_note'], 'informacja o przedsprzedaży', 200, empty=True)
    until = text(values['preorder_until'], 'termin przedsprzedaży', 10, empty=True)
    if until and not re.fullmatch(r'20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])', until):
        raise ValueError('Termin przedsprzedaży w formacie RRRR-MM-DD')
    values['preorder_until'] = until
    if values['preorder'] and not values['preorder_note']:
        raise ValueError('Przedsprzedaż wymaga informacji o planowanej wysyłce')
    values['size_guide'] = text(values['size_guide'], 'rozmiarówka', 2000, empty=True)
    values['description'] = description_value(values['description'])
    import commerce_merch as merch
    if values['badge'] not in merch.MANUAL_BADGES:
        raise ValueError('Wybierz odznakę z listy')
    values['release_at'] = merch.release_value(values['release_at'])
    values['created_at'] = (existing or {}).get('created_at') or ''  # never settable by clients
    values['gift_card'] = flag(values['gift_card'], 'karta podarunkowa')
    if values['gift_card'] and values['personalization_enabled']:
        raise ValueError('Karta podarunkowa nie może mieć nadruku')
    values['pos_quick'] = flag(values['pos_quick'], 'kafelek kasy')
    values['print_layout'] = layout_value(values['print_layout'])
    values.pop('decoration_method_label', None)
    return values


def description_value(value):
    """Plain-text product description (paragraphs, '## ' headings, '- ' lists). No HTML, no unfilled [template fields]."""
    if value is None:
        value = ''
    if not isinstance(value, str) or len(value) > 4000 or any(ord(ch) < 32 and ch not in '\n\t\r' for ch in value):
        raise ValueError('Opis produktu: maksymalnie 4000 znaków, bez znaków sterujących')
    value = value.replace('\r\n', '\n').strip('\n')
    if re.search(r'<\s*/?\s*[a-zA-Z]', value):
        raise ValueError('Opis produktu nie może zawierać znaczników HTML')
    unfilled = [token for token in re.findall(r'\[[^\]\n]{1,80}\](?!\()', value)]
    if unfilled:
        raise ValueError(f'Opis produktu ma niewypełnione pola szablonu: {unfilled[0]}')
    return value


def save_options(c, pid, value):
    layout = json.dumps(value['print_layout'], ensure_ascii=False, sort_keys=True) if value.get('print_layout') else ''
    c.execute('''INSERT INTO product_options(product_id,image,subtitle,personalization_enabled,personalization_required,personalization_fee,
        decoration_method,preorder,preorder_note,preorder_until,size_guide,print_layout,description,badge,release_at,created_at,gift_card,pos_quick)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET
        image=excluded.image,subtitle=excluded.subtitle,
        personalization_enabled=excluded.personalization_enabled,
        personalization_required=excluded.personalization_required,
        personalization_fee=excluded.personalization_fee,
        decoration_method=excluded.decoration_method,preorder=excluded.preorder,preorder_note=excluded.preorder_note,
        preorder_until=excluded.preorder_until,size_guide=excluded.size_guide,print_layout=excluded.print_layout,description=excluded.description,badge=excluded.badge,release_at=excluded.release_at,gift_card=excluded.gift_card,pos_quick=excluded.pos_quick''',
        (pid, value['image'], value['subtitle'], value['personalization_enabled'], value['personalization_required'],
         value['personalization_fee'], value['decoration_method'], int(value['preorder']), value['preorder_note'],
         value['preorder_until'], value['size_guide'], layout, value.get('description', ''), value.get('badge', ''), value.get('release_at', ''), value.get('created_at', ''), int(bool(value.get('gift_card'))), int(bool(value.get('pos_quick')))))


def line_extras(c, product_id):
    """Immutable production facts copied onto an order line at purchase time."""
    options = product_options(c, product_id)
    extras = {}
    if options['personalization_enabled']:
        extras['decoration_method'] = options['decoration_method']
        if options['print_layout']:
            extras['print_layout'] = options['print_layout']
    if options['preorder']:
        extras['preorder'] = {'note': options['preorder_note'], 'until': options['preorder_until']}
    return extras


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
