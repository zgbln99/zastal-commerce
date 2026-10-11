"""Additive, versioned product galleries. Uploads reuse commerce_cms sanitation."""
import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
import commerce_cms as cms
import commerce_personalization as personalization

ASSETS = Path(__file__).resolve().parent / 'storefront/public/assets'
IMAGE_ID = re.compile(r'[A-Za-z0-9_-]{1,80}')
ASSET_URL = re.compile(r'/assets/[A-Za-z0-9_./-]+')
MEDIA_URL = re.compile(r'/api/store/media/([0-9a-f]{32}\.webp)')
ROLES = ('packshot', 'model', 'detail', 'lifestyle')
REQUIRED = {'id', 'url', 'role', 'alt', 'illustrative'}


class Conflict(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def encode(images):
    return json.dumps(images, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def init_schema(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS product_galleries (
        product_id INTEGER PRIMARY KEY REFERENCES products(id),
        images TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS product_gallery_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id),
        revision INTEGER NOT NULL, images TEXT NOT NULL, created TEXT NOT NULL,
        UNIQUE(product_id, revision))''')


def plain_text(value, limit):
    return (isinstance(value, str) and len(value) <= limit
            and not any(ord(ch) < 32 or ord(ch) == 127 or ch in '<>' for ch in value))


def valid_source(value):
    if not isinstance(value, str) or len(value) > 400:
        return False
    if not value:
        return True
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 or ch in '<>\\' for ch in value):
        return False
    try:
        parsed = urlsplit(value)
        parsed.port  # Reject invalid ports without any network access.
        return (parsed.scheme == 'https' and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None)
    except ValueError:
        return False


def valid_image_url(value):
    """Accept only existing local files; never fetch a supplied URL."""
    if not isinstance(value, str):
        return False
    uploaded = MEDIA_URL.fullmatch(value)
    if uploaded:
        return cms.load_media(uploaded.group(1)) is not None
    if not ASSET_URL.fullmatch(value):
        return False
    parts = value[len('/assets/'):].split('/')
    if any(part in ('', '.', '..') for part in parts):
        return False
    try:
        root = ASSETS.resolve()
        file = (root / '/'.join(parts)).resolve()
        return file.is_relative_to(root) and file.is_file()
    except (OSError, RuntimeError, ValueError):
        return False


def validate_images(images):
    if not isinstance(images, list) or len(images) > 20:
        raise ValueError('Galeria może zawierać maksymalnie 20 zdjęć')
    ids, urls, clean = set(), set(), []
    for item in images:
        if (not isinstance(item, dict) or not REQUIRED <= set(item)
                or set(item) - REQUIRED - {'source_url'}):
            raise ValueError('Nieprawidłowe pola zdjęcia')
        identifier, url = item['id'], item['url']
        if not isinstance(identifier, str) or not IMAGE_ID.fullmatch(identifier) or identifier in ids:
            raise ValueError('Identyfikator zdjęcia musi być unikalny i poprawny')
        if not valid_image_url(url) or url in urls:
            raise ValueError('Wybierz unikalne zdjęcie z biblioteki mediów lub zasobów sklepu')
        if item['role'] not in ROLES:
            raise ValueError('Nieprawidłowa rola zdjęcia')
        if not plain_text(item['alt'], 250):
            raise ValueError('Nieprawidłowy opis zdjęcia')
        if type(item['illustrative']) is not bool:
            raise ValueError('Potwierdź status materiału poglądowego')
        source = item.get('source_url', '')
        if not valid_source(source):
            raise ValueError('Źródło zdjęcia musi być adresem HTTPS bez danych logowania')
        clean.append({**item, 'source_url': source})
        ids.add(identifier); urls.add(url)
    return clean


def get(conn, product_id):
    if (type(product_id) is not int or not 1 <= product_id <= 9223372036854775807
            or not conn.execute('SELECT 1 FROM products WHERE id=?', (product_id,)).fetchone()):
        raise LookupError('Produkt nie istnieje')
    row = conn.execute('SELECT images,revision FROM product_galleries WHERE product_id=?', (product_id,)).fetchone()
    return {'images': json.loads(row['images']) if row else [],
            'revision': row['revision'] if row else 0}


def save(conn, product_id, data):
    """Caller owns BEGIN IMMEDIATE and commit, including its audit event."""
    previous = get(conn, product_id)
    if not isinstance(data, dict) or set(data) != {'images', 'expected_revision'}:
        raise ValueError('Podaj zdjęcia i oczekiwaną wersję galerii')
    images = validate_images(data['images'])
    expected = data['expected_revision']
    if type(expected) is not int or expected < 0:
        raise ValueError('Nieprawidłowa wersja galerii')
    if expected != previous['revision']:
        raise Conflict('Galeria została zmieniona. Odśwież dane przed zapisem.')
    revision, timestamp = previous['revision'] + 1, now()
    # Retain the complete original empty state, then every accepted new state.
    if previous['revision'] == 0:
        conn.execute('INSERT INTO product_gallery_revisions(product_id,revision,images,created) VALUES(?,0,?,?)',
                     (product_id, encode(previous['images']), timestamp))
    conn.execute('''INSERT INTO product_galleries(product_id,images,revision,updated) VALUES(?,?,?,?)
        ON CONFLICT(product_id) DO UPDATE SET images=excluded.images,
        revision=excluded.revision,updated=excluded.updated''',
        (product_id, encode(images), revision, timestamp))
    conn.execute('INSERT INTO product_gallery_revisions(product_id,revision,images,created) VALUES(?,?,?,?)',
                 (product_id, revision, encode(images), timestamp))
    return {'images': images, 'revision': revision}


def public_gallery(conn, product):
    state = get(conn, product['id'])
    images = state['images']
    if not images and product.get('image'):
        legacy = product['image']
        try:
            # Legacy product_options also supports safe HTTPS images. Preserve it.
            personalization.image_value(legacy)
        except (ValueError, TypeError):
            legacy = ''
        if legacy:
            images = [{'id': 'legacy-'+str(product['id']), 'url': legacy, 'role': 'packshot',
                       'alt': product['name'], 'illustrative': True, 'source_url': ''}]
    return {'images': images, 'gallery_revision': state['revision']}
