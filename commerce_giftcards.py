"""Gift cards: issued by staff or bought online as a digital product, redeemed online and at the POS.

A card has a code, an initial value, a balance and an expiry. Every balance change is a
transaction tied to an order. Redemptions are reserved when the order is created and released
when the order is cancelled or expires unpaid. Cards bought online are issued the moment the
order is paid and e-mailed to the buyer or to the recipient named at checkout.
"""
import datetime as dt
import json
import re
import secrets
import sqlite3

ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
CODE = re.compile(r'^ZG-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$')
EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$')
from zoneinfo import ZoneInfo

LOCAL = ZoneInfo('Europe/Warsaw')
MIN_VALUE, MAX_VALUE = 1000, 200000
VALIDITY_DAYS = 365
STATUSES = ('active', 'blocked')


class GiftError(Exception):
    def __init__(self, status, message, code='gift_card_invalid'):
        super().__init__(message)
        self.status, self.code = status, code


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def stamp(moment=None):
    return (moment or now_utc()).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS gift_cards(
            id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
            initial_value INTEGER NOT NULL CHECK(initial_value > 0), balance INTEGER NOT NULL CHECK(balance >= 0),
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked')),
            issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, issued_by INTEGER, order_id INTEGER,
            recipient_email TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS gift_card_transactions(
            id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER NOT NULL REFERENCES gift_cards(id),
            order_id INTEGER, amount INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('issue','redeem','release')),
            created TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
        CREATE INDEX IF NOT EXISTS gift_card_transactions_order ON gift_card_transactions(order_id);
    ''')
    present = {row['name'] for row in c.execute('PRAGMA table_info(gift_cards)')}
    if 'customer_id' not in present:
        c.execute('ALTER TABLE gift_cards ADD COLUMN customer_id INTEGER')
    if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pos_sales'").fetchone():
        present = {row['name'] for row in c.execute('PRAGMA table_info(pos_sales)')}
        if 'gift_card_amount' not in present:
            c.execute('ALTER TABLE pos_sales ADD COLUMN gift_card_amount INTEGER NOT NULL DEFAULT 0')


# ------------------------------------------------------------------ codes
def generate_code(c):
    while True:
        raw = ''.join(secrets.choice(ALPHABET) for _ in range(12))
        code = f'ZG-{raw[:4]}-{raw[4:8]}-{raw[8:]}'
        if not c.execute('SELECT 1 FROM gift_cards WHERE code=?', (code,)).fetchone():
            return code


def normalize_code(value):
    if not isinstance(value, str):
        raise GiftError(400, 'Podaj kod karty podarunkowej')
    raw = re.sub(r'[^A-Za-z0-9]', '', value).upper()
    if raw.startswith('ZG'):
        raw = raw[2:]
    code = f'ZG-{raw[:4]}-{raw[4:8]}-{raw[8:12]}' if len(raw) == 12 else ''
    if not CODE.fullmatch(code):
        raise GiftError(400, 'Kod karty ma format ZG-XXXX-XXXX-XXXX')
    return code


def mask(code):
    return 'ZG-••••-••••-' + code[-4:] if code else ''


# ------------------------------------------------------------------ issuing
def _value(value):
    if isinstance(value, bool) or not isinstance(value, int) or not MIN_VALUE <= value <= MAX_VALUE:
        raise GiftError(400, f'Wartość karty od {MIN_VALUE // 100} do {MAX_VALUE // 100} PLN')
    return value


def _email(value, required=False):
    if value in (None, ''):
        if required:
            raise GiftError(400, 'Podaj adres e-mail odbiorcy karty')
        return ''
    if not isinstance(value, str) or not EMAIL.fullmatch(value.strip()):
        raise GiftError(400, 'Podaj poprawny adres e-mail odbiorcy')
    return value.strip().casefold()


def _text(value, label, limit):
    if value in (None, ''):
        return ''
    if not isinstance(value, str) or len(value) > limit or any(ord(ch) < 32 and ch not in '\n' for ch in value):
        raise GiftError(400, f'{label}: do {limit} znaków')
    return value.strip()


def _expiry(value):
    if value in (None, ''):
        return (now_utc().astimezone(LOCAL) + dt.timedelta(days=VALIDITY_DAYS)).strftime('%Y-%m-%d')
    if not isinstance(value, str) or not re.fullmatch(r'20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])', value):
        raise GiftError(400, 'Data ważności w formacie RRRR-MM-DD')
    if value < now_utc().astimezone(LOCAL).strftime('%Y-%m-%d'):
        raise GiftError(400, 'Data ważności nie może być w przeszłości')
    return value


def issue(c, value, actor_id=None, recipient_email='', message='', expires_at='', order_id=None, note=''):
    value = _value(value)
    code = generate_code(c)
    now = stamp()
    cursor = c.execute('''INSERT INTO gift_cards(code,initial_value,balance,status,issued_at,expires_at,issued_by,order_id,recipient_email,message,note)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                       (code, value, value, 'active', now, _expiry(expires_at), actor_id, order_id, _email(recipient_email),
                        _text(message, 'wiadomość', 300), _text(note, 'notatka', 200)))
    c.execute('INSERT INTO gift_card_transactions(card_id,order_id,amount,kind,created,note) VALUES(?,?,?,?,?,?)',
              (cursor.lastrowid, order_id, value, 'issue', now, 'wydanie karty'))
    return admin_card(c, cursor.lastrowid)


# ------------------------------------------------------------------ lookup and redemption
def lookup(c, value):
    code = normalize_code(value)
    row = c.execute('SELECT * FROM gift_cards WHERE code=?', (code,)).fetchone()
    if not row:
        raise GiftError(404, 'Nie znaleziono karty o tym kodzie', 'gift_card_not_found')
    return dict(row)


def state(row, now=None):
    today = (now or now_utc()).astimezone(LOCAL).strftime('%Y-%m-%d')
    if row['status'] == 'blocked':
        return 'blocked'
    if row['expires_at'] < today:
        return 'expired'
    if row['balance'] <= 0:
        return 'used'
    return 'active'


def public_view(row, full=True):
    return {'code': row['code'] if full else mask(row['code']), 'initial_value': row['initial_value'], 'balance': row['balance'],
            'expires_at': row['expires_at'], 'state': state(row)}


def usable(row):
    current = state(row)
    messages = {'blocked': 'Ta karta została zablokowana', 'expired': 'Ta karta straciła ważność', 'used': 'Ta karta została już wykorzystana'}
    if current != 'active':
        raise GiftError(409, messages[current], 'gift_card_' + current)
    return row


def preview(c, value, amount_due):
    """Row and the amount the card would cover for this order, without writing."""
    row = usable(lookup(c, value))
    applied = min(row['balance'], max(0, int(amount_due)))
    if applied <= 0:
        raise GiftError(400, 'Karta nie pokrywa tego zamówienia', 'gift_card_invalid')
    return row, applied


def redeem(c, value, amount_due, order_id, note=''):
    row, applied = preview(c, value, amount_due)
    c.execute('UPDATE gift_cards SET balance=balance-? WHERE id=? AND balance>=?', (applied, row['id'], applied))
    c.execute('INSERT INTO gift_card_transactions(card_id,order_id,amount,kind,created,note) VALUES(?,?,?,?,?,?)',
              (row['id'], order_id, -applied, 'redeem', stamp(), note or f'zamówienie {order_id}'))
    return row, applied


def release(c, order_id, reason=''):
    """Returns redeemed amounts of a cancelled order to the cards. Idempotent."""
    rows = c.execute('''SELECT card_id,SUM(amount) AS redeemed FROM gift_card_transactions WHERE order_id=? AND kind='redeem' GROUP BY card_id''', (order_id,)).fetchall()
    released = 0
    for row in rows:
        already = c.execute("SELECT COALESCE(SUM(amount),0) FROM gift_card_transactions WHERE order_id=? AND card_id=? AND kind='release'", (order_id, row['card_id'])).fetchone()[0]
        amount = -row['redeemed'] - already
        if amount <= 0:
            continue
        c.execute('UPDATE gift_cards SET balance=balance+? WHERE id=?', (amount, row['card_id']))
        c.execute('INSERT INTO gift_card_transactions(card_id,order_id,amount,kind,created,note) VALUES(?,?,?,?,?,?)',
                  (row['card_id'], order_id, amount, 'release', stamp(), reason or 'anulowanie zamówienia'))
        released += amount
    return released


# ------------------------------------------------------------------ cards bought as products
def is_gift_line(item):
    return isinstance(item, dict) and item.get('gift_card') is True


def on_paid(c, order_id, actor_id=None):
    """Issue the cards contained in a paid order (once) and mail them. Digital-only orders are completed."""
    order = c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
    if not order:
        return []
    items = json.loads(order['items'] or '[]')
    gift_lines = [item for item in items if is_gift_line(item)]
    if not gift_lines or c.execute('SELECT 1 FROM gift_cards WHERE order_id=?', (order_id,)).fetchone():
        return []
    try:
        detail = c.execute('SELECT * FROM order_details WHERE order_id=?', (order_id,)).fetchone()
    except sqlite3.OperationalError:
        detail = None
    detail = dict(detail) if detail else {}
    recipient = detail.get('gift_email') or detail.get('customer_email') or ''
    message = detail.get('gift_message') or ''
    import commerce_email as mail
    issued = []
    for item in gift_lines:
        for _ in range(int(item.get('qty', 1))):
            card = issue(c, int(item.get('base_unit_price') or item.get('unit_price')), actor_id, recipient, message, '', order_id, 'zakup w sklepie')
            if recipient:
                mail.enqueue_guest(c, 'gift_card_issued', recipient, f'gift_card:{card["id"]}')
            issued.append(card)
    if len(gift_lines) == len(items) and order['status'] not in ('wydane', 'anulowane'):
        import commerce_sales as sales
        sales._event(c, order_id, 'wydane')
    return issued


def card_message(c, card_id, origin):
    row = c.execute('SELECT * FROM gift_cards WHERE id=?', (card_id,)).fetchone()
    if not row:
        return None
    value = f'{row["initial_value"] / 100:.2f} PLN'
    subject = f'Karta podarunkowa Zastal Store o wartości {value}'
    lines = [f'Masz kartę podarunkową do oficjalnego sklepu Zastalu Zielona Góra o wartości {value}.', '',
             f'Kod karty: {row["code"]}', f'Ważna do: {row["expires_at"]}', '']
    if row['message']:
        lines += ['Wiadomość od nadawcy:', row['message'], '']
    lines += ['Jak użyć: w sklepie online wpisz kod w polu „Karta podarunkowa” w podsumowaniu zamówienia;',
              'w sklepie klubowym pokaż kod przy kasie. Kartę można wykorzystać w kilku zakupach, aż do wyczerpania salda.',
              f'Saldo sprawdzisz tutaj: {origin}/karta-podarunkowa', '', 'Karta nie podlega wymianie na gotówkę.']
    return subject, '\n'.join(lines) + '\n'


def order_cards(c, order_id):
    return [public_view(dict(row)) for row in c.execute('SELECT * FROM gift_cards WHERE order_id=? ORDER BY id', (order_id,))]


# ------------------------------------------------------------------ customer account
def attach(c, value, customer_id):
    """Binds a card to the customer's account; a card belongs to one account only."""
    row = lookup(c, value)
    if row.get('customer_id') and row['customer_id'] != customer_id:
        raise GiftError(409, 'Ta karta jest już przypisana do innego konta', 'gift_card_taken')
    c.execute('UPDATE gift_cards SET customer_id=? WHERE id=?', (customer_id, row['id']))
    return account_card(c, row['id'])


def account_card(c, card_id):
    row = c.execute('SELECT * FROM gift_cards WHERE id=?', (card_id,)).fetchone()
    value = public_view(dict(row))
    value['id'] = row['id']
    value['transactions'] = [{'kind': t['kind'], 'amount': t['amount'], 'order_id': t['order_id'], 'created': t['created']}
                             for t in c.execute('SELECT * FROM gift_card_transactions WHERE card_id=? ORDER BY id', (card_id,))]
    return value


def account_cards(c, customer_id):
    return [account_card(c, row['id']) for row in c.execute('SELECT id FROM gift_cards WHERE customer_id=? ORDER BY id DESC', (customer_id,))]


# ------------------------------------------------------------------ admin
def admin_card(c, card_id):
    row = c.execute('SELECT * FROM gift_cards WHERE id=?', (card_id,)).fetchone()
    if not row:
        raise GiftError(404, 'Nie znaleziono karty', 'gift_card_not_found')
    value = dict(row)
    value['state'] = state(value)
    value['transactions'] = [dict(t) for t in c.execute('SELECT * FROM gift_card_transactions WHERE card_id=? ORDER BY id', (card_id,))]
    return value


def admin_list(c, limit=300):
    rows = [dict(row) for row in c.execute('''SELECT g.*,u.identifier AS customer FROM gift_cards g LEFT JOIN users u ON u.id=g.customer_id ORDER BY g.id DESC LIMIT ?''', (limit,))]
    for row in rows:
        row['state'] = state(row)
    return rows


def set_status(c, card_id, status, note=''):
    if status not in STATUSES:
        raise GiftError(400, 'Status karty: active albo blocked')
    if not c.execute('SELECT 1 FROM gift_cards WHERE id=?', (card_id,)).fetchone():
        raise GiftError(404, 'Nie znaleziono karty', 'gift_card_not_found')
    c.execute('UPDATE gift_cards SET status=?,note=CASE WHEN ?<>\'\' THEN ? ELSE note END WHERE id=?', (status, note, _text(note, 'notatka', 200), card_id))
    return admin_card(c, card_id)
