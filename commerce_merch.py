"""Merchandising: product badges, releases (drops), back-in-stock alerts and promo codes.

Badges are computed from real data (price history, paid sales, creation date, release date)
unless the staff set one by hand. Releases block online checkout until the announced time.
Stock alerts e-mail a guest once a sold-out size is back. Promo codes are validated and
consumed server-side; the discount is stored on the order.
"""
import datetime as dt
import json
import re
import sqlite3
from collections import defaultdict
from zoneinfo import ZoneInfo

BADGES = {'nowosc': 'Nowość', 'bestseller': 'Bestseller', 'promocja': 'Promocja', 'wyprzedaz': 'Wyprzedaż',
          'limitowana': 'Edycja limitowana', 'premiera': 'Premiera'}
MANUAL_BADGES = ('', 'none') + tuple(key for key in BADGES if key != 'premiera')
LOCAL = ZoneInfo('Europe/Warsaw')
EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$')
CODE = re.compile(r'^[A-Z0-9][A-Z0-9-]{2,23}$')
NEW_DAYS = 30
BESTSELLER_DAYS = 30


class MerchError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status, self.code = status, code


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def stamp(moment=None):
    return (moment or now_utc()).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS stock_alerts(
            id INTEGER PRIMARY KEY AUTOINCREMENT, variant_id INTEGER NOT NULL REFERENCES product_variants(id),
            email TEXT NOT NULL, created TEXT NOT NULL, notified_at TEXT, UNIQUE(variant_id,email));
        CREATE TABLE IF NOT EXISTS promo_codes(
            id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL CHECK(kind IN ('percent','amount')), value INTEGER NOT NULL CHECK(value > 0),
            min_subtotal INTEGER NOT NULL DEFAULT 0 CHECK(min_subtotal >= 0),
            starts TEXT NOT NULL DEFAULT '', ends TEXT NOT NULL DEFAULT '',
            max_uses INTEGER NOT NULL DEFAULT 0 CHECK(max_uses >= 0), uses INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL);
    ''')


# ------------------------------------------------------------------ releases
def parse_release(value):
    """'YYYY-MM-DDTHH:MM' entered as Polish local time -> aware UTC datetime, or None."""
    if not value:
        return None
    try:
        return dt.datetime.strptime(value, '%Y-%m-%dT%H:%M').replace(tzinfo=LOCAL).astimezone(dt.timezone.utc)
    except ValueError:
        return None


def release_value(value):
    if value in (None, ''):
        return ''
    if not isinstance(value, str) or parse_release(value) is None:
        raise ValueError('Premiera: data i godzina w formacie RRRR-MM-DDTGG:MM')
    return value


def unreleased(product, now=None):
    moment = parse_release(product.get('release_at') if isinstance(product, dict) else product['release_at'])
    return bool(moment and moment > (now or now_utc()))


def release_label(value):
    moment = parse_release(value)
    return moment.astimezone(LOCAL).strftime('%d.%m, %H:%M') if moment else ''


# ------------------------------------------------------------------ badges
def bestsellers(c, days=BESTSELLER_DAYS, limit=3, minimum=2, now=None):
    """Product ids with the most pieces sold in paid live orders and real POS sales."""
    since = stamp((now or now_utc()) - dt.timedelta(days=days))
    counts = defaultdict(int)
    try:
        rows = c.execute('''SELECT o.items FROM orders o LEFT JOIN order_details d ON d.order_id=o.id
                            LEFT JOIN pos_sales p ON p.order_id=o.id
                            WHERE o.created>=? AND o.status NOT IN ('anulowane','zwrot')
                              AND ((d.mode='live' AND d.payment_status IN ('paid','partially_refunded')) OR p.demo=0)''', (since,)).fetchall()
    except sqlite3.OperationalError:
        return []
    sku_to_id = {row['sku']: row['id'] for row in c.execute('SELECT id,sku FROM products')}
    for row in rows:
        try:
            items = json.loads(row['items'] or '[]')
        except ValueError:
            continue
        for item in items:
            pid = sku_to_id.get(item.get('sku'))
            if pid:
                counts[pid] += int(item.get('qty', 1) or 0)
    ranked = sorted((pid for pid, qty in counts.items() if qty >= minimum), key=lambda pid: (-counts[pid], pid))
    return ranked[:limit]


def badge_for(product, best, now=None):
    now = now or now_utc()
    manual = product.get('badge') or ''
    if manual == 'none':
        return None
    if unreleased(product, now):
        return {'code': 'premiera', 'label': 'Premiera ' + release_label(product['release_at'])}
    if manual in BADGES:
        return {'code': manual, 'label': BADGES[manual]}
    if product.get('price_reduction'):
        return {'code': 'promocja', 'label': BADGES['promocja']}
    if product['id'] in best:
        return {'code': 'bestseller', 'label': BADGES['bestseller']}
    created = product.get('created_at')
    if created:
        try:
            if dt.datetime.fromisoformat(created) >= now - dt.timedelta(days=NEW_DAYS):
                return {'code': 'nowosc', 'label': BADGES['nowosc']}
        except ValueError:
            pass
    return None


def annotate(c, products, now=None):
    now = now or now_utc()
    best = set(bestsellers(c, now=now))
    for product in products:
        product['badge_info'] = badge_for(product, best, now)
        product['released'] = not unreleased(product, now)
        moment = parse_release(product.get('release_at'))
        product['release_epoch'] = int(moment.timestamp()) if moment else None
    return products


# ------------------------------------------------------------------ stock alerts
def subscribe(c, product_id, size, email):
    if not isinstance(email, str) or not EMAIL.fullmatch(email.strip()):
        raise MerchError(400, 'Podaj poprawny adres e-mail', 'invalid_email')
    email = email.strip().casefold()
    if not isinstance(product_id, int) or isinstance(product_id, bool) or not isinstance(size, str):
        raise MerchError(400, 'Wybierz produkt i rozmiar')
    variant = c.execute('SELECT * FROM product_variants WHERE product_id=? AND size=?', (product_id, size[:12])).fetchone()
    if not variant:
        raise MerchError(404, 'Nie znaleziono wariantu', 'variant_not_found')
    if variant['stock'] > 0:
        raise MerchError(409, 'Ten rozmiar jest dostępny. Dodaj go do koszyka.', 'in_stock')
    c.execute('INSERT OR IGNORE INTO stock_alerts(variant_id,email,created) VALUES(?,?,?)', (variant['id'], email, stamp()))
    c.execute('UPDATE stock_alerts SET notified_at=NULL WHERE variant_id=? AND email=?', (variant['id'], email))
    return {'ok': True, 'message': 'Damy znać e-mailem, gdy ten rozmiar wróci do sklepu.'}


def notify_available(c):
    """Queue one e-mail per waiting subscriber whose size is back in stock. Returns the number queued."""
    import commerce_email as mail
    rows = c.execute('''SELECT a.id,a.email FROM stock_alerts a JOIN product_variants v ON v.id=a.variant_id
                        WHERE a.notified_at IS NULL AND v.stock>0 ORDER BY a.id''').fetchall()
    for row in rows:
        mail.enqueue_guest(c, 'stock_alert', row['email'], f'stock_alert:{row["id"]}')
        c.execute('UPDATE stock_alerts SET notified_at=? WHERE id=?', (stamp(), row['id']))
    return len(rows)


def alert_message(c, alert_id, origin):
    row = c.execute('''SELECT a.email,v.size,p.id AS product_id,p.name FROM stock_alerts a
                       JOIN product_variants v ON v.id=a.variant_id JOIN products p ON p.id=v.product_id WHERE a.id=?''', (alert_id,)).fetchone()
    if not row:
        return None
    size = '' if row['size'] == 'UNI' else f' w rozmiarze {row["size"]}'
    subject = f'{row["name"]}{size} jest znów dostępny'
    body = (f'{row["name"]}{size} wrócił do sklepu Zastalu.\n\n{origin}/produkt/{row["product_id"]}\n\n'
            'Ilość jest ograniczona, więc nie czekaj zbyt długo.\nTę wiadomość wysłaliśmy jednorazowo na Twoją prośbę.')
    return subject, body


def pending_alerts(c):
    return [dict(row) for row in c.execute('''SELECT p.id AS product_id,p.name,v.size,v.stock,COUNT(*) AS waiting
        FROM stock_alerts a JOIN product_variants v ON v.id=a.variant_id JOIN products p ON p.id=v.product_id
        WHERE a.notified_at IS NULL GROUP BY v.id ORDER BY waiting DESC,p.name,v.id''')]


# ------------------------------------------------------------------ promo codes
def normalize_code(value):
    if not isinstance(value, str):
        raise MerchError(400, 'Podaj kod rabatowy', 'promo_invalid')
    code = value.strip().upper()
    if not CODE.fullmatch(code):
        raise MerchError(400, 'Kod rabatowy: 3 do 24 znaków, litery, cyfry i myślniki', 'promo_invalid')
    return code


def discount_for(row, subtotal):
    if row['kind'] == 'percent':
        return min(subtotal, subtotal * row['value'] // 100)
    return min(subtotal, row['value'])


def find_code(c, value, subtotal, now=None):
    """Active, in-window, not exhausted code applicable to the subtotal -> (row, discount in grosze)."""
    code = normalize_code(value)
    row = c.execute('SELECT * FROM promo_codes WHERE code=?', (code,)).fetchone()
    today = (now or now_utc()).astimezone(LOCAL).strftime('%Y-%m-%d')
    if not row or not row['active'] or (row['starts'] and today < row['starts']) or (row['ends'] and today > row['ends']):
        raise MerchError(400, 'Ten kod rabatowy jest nieaktywny', 'promo_invalid')
    if row['max_uses'] and row['uses'] >= row['max_uses']:
        raise MerchError(400, 'Ten kod rabatowy został już wykorzystany', 'promo_exhausted')
    if subtotal < row['min_subtotal']:
        raise MerchError(400, f'Kod działa od {row["min_subtotal"] / 100:.2f} PLN wartości produktów', 'promo_minimum')
    discount = discount_for(row, subtotal)
    if discount <= 0:
        raise MerchError(400, 'Ten kod nie obniża tego zamówienia', 'promo_invalid')
    return dict(row), discount


def consume(c, promo_id):
    c.execute('UPDATE promo_codes SET uses=uses+1 WHERE id=?', (promo_id,))


def public_code(row, discount):
    return {'code': row['code'], 'kind': row['kind'], 'value': row['value'], 'discount': discount,
            'label': f'{row["value"]}%' if row['kind'] == 'percent' else f'{row["value"] / 100:.2f} PLN'}


def _date(value, label):
    if value in (None, ''):
        return ''
    if not isinstance(value, str) or not re.fullmatch(r'20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])', value):
        raise MerchError(400, f'{label}: data w formacie RRRR-MM-DD')
    return value


def _int(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise MerchError(400, f'{label}: liczba od {low} do {high}')
    return value


def save_code(c, data, promo_id=None):
    if not isinstance(data, dict):
        raise MerchError(400, 'Oczekiwano danych kodu')
    row = c.execute('SELECT * FROM promo_codes WHERE id=?', (promo_id,)).fetchone() if promo_id else None
    if promo_id and not row:
        raise MerchError(404, 'Nie znaleziono kodu', 'promo_not_found')
    current = dict(row) if row else {'kind': 'percent', 'value': 10, 'min_subtotal': 0, 'starts': '', 'ends': '', 'max_uses': 0, 'active': 1, 'note': ''}
    code = normalize_code(data['code']) if 'code' in data else current.get('code')
    if not code:
        raise MerchError(400, 'Podaj kod rabatowy', 'promo_invalid')
    kind = data.get('kind', current['kind'])
    if kind not in ('percent', 'amount'):
        raise MerchError(400, 'Rodzaj rabatu: procent albo kwota')
    value = _int(data.get('value', current['value']), 'Wartość rabatu', 1, 100 if kind == 'percent' else 100000000)
    min_subtotal = _int(data.get('min_subtotal', current['min_subtotal']), 'Minimalna wartość produktów', 0, 100000000)
    max_uses = _int(data.get('max_uses', current['max_uses']), 'Limit użyć', 0, 1000000)
    starts, ends = _date(data.get('starts', current['starts']), 'Początek'), _date(data.get('ends', current['ends']), 'Koniec')
    if starts and ends and ends < starts:
        raise MerchError(400, 'Koniec nie może być przed początkiem')
    active = data.get('active', bool(current['active']))
    if not isinstance(active, bool):
        raise MerchError(400, 'Aktywność: tak albo nie')
    note = data.get('note', current['note'])
    if not isinstance(note, str) or len(note) > 200:
        raise MerchError(400, 'Notatka: do 200 znaków')
    try:
        if row:
            c.execute('UPDATE promo_codes SET code=?,kind=?,value=?,min_subtotal=?,starts=?,ends=?,max_uses=?,active=?,note=? WHERE id=?',
                      (code, kind, value, min_subtotal, starts, ends, max_uses, int(active), note.strip(), promo_id))
        else:
            cursor = c.execute('INSERT INTO promo_codes(code,kind,value,min_subtotal,starts,ends,max_uses,active,note,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
                               (code, kind, value, min_subtotal, starts, ends, max_uses, int(active), note.strip(), stamp()))
            promo_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise MerchError(409, 'Taki kod już istnieje', 'promo_exists')
    return dict(c.execute('SELECT * FROM promo_codes WHERE id=?', (promo_id,)).fetchone())


def list_codes(c):
    return [dict(row) for row in c.execute('SELECT * FROM promo_codes ORDER BY active DESC,id DESC')]
