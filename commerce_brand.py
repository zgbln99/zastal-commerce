"""Brand settings edited in the admin panel: the competitions the club plays in (league and cup logotypes shown in the
header and footer) and the short tagline under the shop name. Logos are uploaded by staff, never drawn by the shop."""
import base64
import hashlib
import io
import json
import re

from PIL import Image, UnidentifiedImageError

import commerce_cms as cms

MAX_COMPETITIONS = 6
DEFAULT = {
    'tagline': 'Oficjalny sklep klubu',
    'competitions': [
        {'key': 'liga', 'name': 'Orlen Basket Liga', 'url': 'https://plk.pl', 'image': '', 'enabled': True},
        {'key': 'fec', 'name': 'FIBA Europe Cup', 'url': 'https://www.fiba.basketball/en/europe-cup', 'image': '', 'enabled': True},
    ],
}
MEDIA_URL = re.compile(r'/api/store/media/[0-9a-f]{32}\.webp')


class BrandError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status, self.code = status, code


def init_schema(c):
    c.execute('CREATE TABLE IF NOT EXISTS site_brand(id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, updated TEXT NOT NULL)')


def get(c):
    row = c.execute('SELECT config FROM site_brand WHERE id=1').fetchone()
    if not row:
        return json.loads(json.dumps(DEFAULT))
    try:
        return _normalize(json.loads(row['config']))
    except (ValueError, BrandError):
        return json.loads(json.dumps(DEFAULT))


def public(c):
    """What the storefront needs: enabled competitions in order, plus the tagline."""
    config = get(c)
    return {'tagline': config['tagline'], 'competitions': [{k: entry[k] for k in ('key', 'name', 'url', 'image')} for entry in config['competitions'] if entry['enabled']]}


def _normalize(data):
    if not isinstance(data, dict):
        raise BrandError(400, 'Nieprawidłowe dane')
    tagline = data.get('tagline', DEFAULT['tagline'])
    if not isinstance(tagline, str) or len(tagline.strip()) > 60 or any(ord(ch) < 32 for ch in tagline):
        raise BrandError(400, 'Podpis pod nazwą: do 60 znaków')
    raw = data.get('competitions', [])
    if not isinstance(raw, list) or len(raw) > MAX_COMPETITIONS:
        raise BrandError(400, f'Maksymalnie {MAX_COMPETITIONS} rozgrywek')
    competitions, keys = [], set()
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise BrandError(400, 'Nieprawidłowy wpis rozgrywek')
        name = entry.get('name', '')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 60 or any(ord(ch) < 32 for ch in name):
            raise BrandError(400, 'Nazwa rozgrywek: od 1 do 60 znaków')
        url = entry.get('url', '') or ''
        if not isinstance(url, str) or len(url) > 300 or (url and not re.fullmatch(r'https://[^\s<>"\']+', url)):
            raise BrandError(400, 'Adres rozgrywek musi zaczynać się od https://')
        image = entry.get('image', '') or ''
        if not isinstance(image, str) or (image and not MEDIA_URL.fullmatch(image)):
            raise BrandError(400, 'Logo musi być wgrane przez panel')
        key = entry.get('key') or re.sub(r'[^a-z0-9]+', '-', name.strip().lower()).strip('-')[:30] or f'rozgrywki-{index + 1}'
        if not isinstance(key, str) or not re.fullmatch(r'[a-z0-9-]{1,30}', key):
            raise BrandError(400, 'Nieprawidłowy identyfikator rozgrywek')
        while key in keys:
            key = f'{key}-{index + 1}'
        keys.add(key)
        competitions.append({'key': key, 'name': name.strip(), 'url': url, 'image': image, 'enabled': entry.get('enabled', True) is True})
    return {'tagline': tagline.strip(), 'competitions': competitions}


def save(c, data):
    import datetime as dt
    config = _normalize(data)
    c.execute('INSERT INTO site_brand(id,config,updated) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,updated=excluded.updated',
              (json.dumps(config, ensure_ascii=False), dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')))
    return config


def write_logo(data):
    """Logotype upload: PNG or WebP, transparency kept, scaled to at most 800 px. Returns the public URL."""
    if not isinstance(data, dict) or not isinstance(data.get('image'), str) or len(data['image']) > 1_400_000:
        raise BrandError(400, 'Plik logo jest za duży (maks. 1 MB)')
    try:
        prefix, encoded = data['image'].split(',', 1)
        if prefix not in ('data:image/png;base64', 'data:image/webp;base64'):
            raise ValueError('Logo wgraj jako PNG z przezroczystością albo WebP')
        blob = base64.b64decode(encoded, validate=True)
        with Image.open(io.BytesIO(blob)) as picture:
            picture.verify()
        with Image.open(io.BytesIO(blob)) as picture:
            if picture.width < 40 or picture.height < 40 or picture.width * picture.height > 8_000_000:
                raise ValueError('Logo musi mieć od 40×40 px do 8 Mpix')
            image = picture.convert('RGBA')
            image.thumbnail((800, 800))
            buffer = io.BytesIO()
            image.save(buffer, 'WEBP', quality=90, method=6, lossless=False)
            content = buffer.getvalue()
    except (OSError, UnidentifiedImageError, ValueError, base64.binascii.Error) as ex:
        raise BrandError(400, 'Nieprawidłowy obraz: ' + str(ex)[:90])
    name = hashlib.sha256(content).hexdigest()[:32] + '.webp'
    cms.HOME_MEDIA.mkdir(mode=0o750, parents=True, exist_ok=True)
    destination = cms.HOME_MEDIA / name
    if not destination.exists():
        destination.write_bytes(content)
        destination.chmod(0o640)
    return '/api/store/media/' + name
