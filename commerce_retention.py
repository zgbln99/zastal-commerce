"""Bringing shoppers back: favourites stored on the account, price-drop alerts and abandoned-cart reminders.

Favourites: the browser list is merged with the account list on login (union) and kept in sync afterwards.
Price alerts: one e-mail per address and product, sent once the catalogue price falls below the price seen when
subscribing. Cart reminders: a draft is stored only with the marketing consent from the checkout form (or for a
confirmed newsletter subscriber), one reminder goes out 24 hours later with a link that restores the cart, and an
order placed with that address converts the draft so nothing is sent.
"""
import datetime as dt
import json
import re
import secrets

EMAIL = re.compile(r'^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$')
SIZE = re.compile(r'^[A-Z0-9/ -]{1,12}$')
REMIND_AFTER_HOURS = 24
DRAFT_MAX_AGE_DAYS = 7


class RetentionError(Exception):
    def __init__(self, status, message, code='invalid'):
        super().__init__(message)
        self.status = status
        self.code = code


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS account_favorites(
            user_id INTEGER NOT NULL REFERENCES users(id), product_id INTEGER NOT NULL REFERENCES products(id),
            created TEXT NOT NULL, PRIMARY KEY(user_id, product_id));
        CREATE TABLE IF NOT EXISTS price_alerts(
            id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
            email TEXT NOT NULL, price_at INTEGER NOT NULL CHECK(price_at >= 0), created TEXT NOT NULL, notified_at TEXT,
            UNIQUE(product_id, email));
        CREATE TABLE IF NOT EXISTS cart_drafts(
            id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
            items TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, reminded_at TEXT, converted_at TEXT);
    ''')


def _email(value):
    if not isinstance(value, str) or not EMAIL.fullmatch(value.strip()):
        raise RetentionError(400, 'Podaj poprawny adres e-mail', 'invalid_email')
    return value.strip().casefold()


# ------------------------------------------------------------------ favourites on the account
def favorites(c, user_id):
    return [row['product_id'] for row in c.execute('SELECT product_id FROM account_favorites WHERE user_id=? ORDER BY rowid', (user_id,))]


def merge_favorites(c, user_id, ids, replace=False):
    """Union of the account list and the browser list (or the browser list alone when `replace`). Unknown products are dropped."""
    if not isinstance(ids, list) or len(ids) > 200 or any(isinstance(x, bool) or not isinstance(x, int) or x < 1 for x in ids):
        raise RetentionError(400, 'Nieprawidłowa lista ulubionych')
    known = {row['id'] for row in c.execute('SELECT id FROM products')}
    wanted = [x for x in dict.fromkeys(ids) if x in known]
    current = favorites(c, user_id)
    if replace:
        for pid in current:
            if pid not in wanted:
                c.execute('DELETE FROM account_favorites WHERE user_id=? AND product_id=?', (user_id, pid))
    now = stamp()
    for pid in wanted:
        c.execute('INSERT OR IGNORE INTO account_favorites(user_id,product_id,created) VALUES(?,?,?)', (user_id, pid, now))
    return favorites(c, user_id)


# ------------------------------------------------------------------ price-drop alerts
def subscribe_price(c, product_id, email):
    email = _email(email)
    if isinstance(product_id, bool) or not isinstance(product_id, int):
        raise RetentionError(400, 'Wybierz produkt')
    product = c.execute('SELECT id,price FROM products WHERE id=?', (product_id,)).fetchone()
    if not product:
        raise RetentionError(404, 'Nie znaleziono produktu', 'product_not_found')
    c.execute('INSERT INTO price_alerts(product_id,email,price_at,created) VALUES(?,?,?,?) ON CONFLICT(product_id,email) DO UPDATE SET price_at=excluded.price_at,notified_at=NULL,created=excluded.created',
              (product_id, email, product['price'], stamp()))
    return {'ok': True, 'message': 'Damy znać e-mailem, gdy cena tego produktu spadnie.'}


def notify_price_drops(c):
    """Queue one e-mail per subscriber whose product is now cheaper than when they subscribed. Returns the number queued."""
    import commerce_email as mail
    rows = c.execute('''SELECT a.id,a.email FROM price_alerts a JOIN products p ON p.id=a.product_id
                        WHERE a.notified_at IS NULL AND p.price<a.price_at ORDER BY a.id''').fetchall()
    for row in rows:
        mail.enqueue_guest(c, 'price_alert', row['email'], f'price_alert:{row["id"]}')
        c.execute('UPDATE price_alerts SET notified_at=? WHERE id=?', (stamp(), row['id']))
    return len(rows)


def price_alert_message(c, alert_id, origin):
    import commerce_personalization as personalization
    row = c.execute('SELECT a.price_at,p.id,p.name,p.price FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE a.id=?', (alert_id,)).fetchone()
    if not row:
        return None
    slug = personalization.product_options(c, row['id']).get('slug') or personalization.slugify(row['name']) or f'produkt-{row["id"]}'
    subject = f'{row["name"]} w niższej cenie'
    body = (f'{row["name"]} kosztuje teraz {row["price"] / 100:.2f} PLN zamiast {row["price_at"] / 100:.2f} PLN.\n\n'
            f'{origin}/produkt/{slug}\n\n'
            'Tę wiadomość wysłaliśmy jednorazowo na Twoją prośbę o powiadomienie o obniżce.')
    return subject, body


def pending_price_alerts(c):
    return [dict(row) for row in c.execute('''SELECT p.id AS product_id,p.name,p.price,MIN(a.price_at) AS lowest_seen,COUNT(*) AS waiting
        FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE a.notified_at IS NULL GROUP BY p.id ORDER BY waiting DESC,p.name''')]


# ------------------------------------------------------------------ abandoned carts
def _items(raw):
    if not isinstance(raw, list) or not raw or len(raw) > 30:
        raise RetentionError(400, 'Nieprawidłowy koszyk')
    items = []
    for line in raw:
        if not isinstance(line, dict):
            raise RetentionError(400, 'Nieprawidłowy koszyk')
        pid, qty, size = line.get('id'), line.get('quantity', 1), str(line.get('size') or 'UNI').strip().upper()
        if isinstance(pid, bool) or not isinstance(pid, int) or isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 20 or not SIZE.fullmatch(size):
            raise RetentionError(400, 'Nieprawidłowy koszyk')
        item = {'id': pid, 'quantity': qty, 'size': size}
        print_ = line.get('personalization')
        if isinstance(print_, dict) and print_.get('mode') in ('player', 'custom'):
            item['personalization'] = {key: print_[key] for key in ('mode', 'player_id', 'name', 'number') if key in print_ and isinstance(print_[key], (str, int)) and not isinstance(print_[key], bool)}
        items.append(item)
    return items


def allowed_reminder(c, email, consent):
    """Marketing consent ticked in the checkout, or an address that confirmed the newsletter."""
    if consent is True:
        return True
    row = c.execute("SELECT 1 FROM subscribers WHERE email=? AND status='confirmed'", (email,)).fetchone()
    return bool(row)


def save_draft(c, data):
    """Checkout in progress: keep the cart for a reminder. Without a consent basis nothing is stored."""
    if not isinstance(data, dict):
        raise RetentionError(400, 'Nieprawidłowe żądanie')
    email = _email(data.get('email'))
    items = _items(data.get('items'))
    if not allowed_reminder(c, email, data.get('consent')):
        return {'ok': False, 'stored': False}
    known = {row['id'] for row in c.execute('SELECT id FROM products')}
    items = [item for item in items if item['id'] in known]
    if not items:
        return {'ok': False, 'stored': False}
    now = stamp()
    c.execute('''INSERT INTO cart_drafts(token,email,items,created,updated) VALUES(?,?,?,?,?)
                 ON CONFLICT(email) DO UPDATE SET items=excluded.items,updated=excluded.updated,reminded_at=NULL,converted_at=NULL''',
              (secrets.token_urlsafe(24), email, json.dumps(items, ensure_ascii=False), now, now))
    return {'ok': True, 'stored': True}


def convert_draft(c, email):
    if not isinstance(email, str) or not email:
        return
    c.execute('UPDATE cart_drafts SET converted_at=? WHERE email=? AND converted_at IS NULL', (stamp(), email.strip().casefold()))


def remind_abandoned(c, now=None):
    """One reminder per draft left untouched for 24 h within the last week. Returns the number queued."""
    import commerce_email as mail
    moment = now or dt.datetime.now(dt.timezone.utc)
    cutoff = (moment - dt.timedelta(hours=REMIND_AFTER_HOURS)).isoformat(timespec='seconds')
    oldest = (moment - dt.timedelta(days=DRAFT_MAX_AGE_DAYS)).isoformat(timespec='seconds')
    rows = c.execute('''SELECT id,email FROM cart_drafts WHERE reminded_at IS NULL AND converted_at IS NULL AND updated<? AND updated>? ORDER BY id''', (cutoff, oldest)).fetchall()
    queued = 0
    for row in rows:
        # An order placed meanwhile with the same address (guest checkout without the draft hook) also counts as converted.
        placed = c.execute('SELECT 1 FROM order_details WHERE customer_email=? AND updated>=(SELECT updated FROM cart_drafts WHERE id=?)', (row['email'], row['id'])).fetchone()
        if placed:
            c.execute('UPDATE cart_drafts SET converted_at=? WHERE id=?', (stamp(), row['id']))
            continue
        mail.enqueue_guest(c, 'cart_reminder', row['email'], f'cart_reminder:{row["id"]}')
        c.execute('UPDATE cart_drafts SET reminded_at=? WHERE id=?', (stamp(), row['id']))
        queued += 1
    return queued


def draft_by_token(c, token):
    if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{20,64}', token):
        raise RetentionError(404, 'Nie znaleziono koszyka', 'draft_not_found')
    row = c.execute('SELECT * FROM cart_drafts WHERE token=?', (token,)).fetchone()
    if not row:
        raise RetentionError(404, 'Nie znaleziono koszyka', 'draft_not_found')
    known = {r['id'] for r in c.execute('SELECT id FROM products')}
    return {'items': [item for item in json.loads(row['items']) if item['id'] in known]}


def reminder_message(c, draft_id, origin):
    row = c.execute('SELECT * FROM cart_drafts WHERE id=?', (draft_id,)).fetchone()
    if not row or row['converted_at']:
        return None
    names = []
    for item in json.loads(row['items']):
        product = c.execute('SELECT name FROM products WHERE id=?', (item['id'],)).fetchone()
        if product:
            names.append(f'  {product["name"]}' + ('' if item['size'] == 'UNI' else f', rozmiar {item["size"]}') + (f', {item["quantity"]} szt.' if item['quantity'] > 1 else ''))
    if not names:
        return None
    subject = 'Twój koszyk w Zastal Store czeka'
    body = ('Zostawiłeś/aś w koszyku:\n' + '\n'.join(names) + '\n\n'
            f'Wróć do koszyka: {origin}/koszyk?przywroc={row["token"]}\n\n'
            'Produkty nie są zarezerwowane; stany mogą się zmienić.\n'
            'To jednorazowe przypomnienie wysłane na podstawie zgody marketingowej z formularza zamówienia albo zapisu do newslettera.')
    return subject, body
