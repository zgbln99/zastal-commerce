"""Price history for the Omnibus duty: show the lowest price from the 30 days before a reduction.

Every price change is recorded. When the current price is lower than the price
in force before the most recent reduction (within the last 30 days), the catalogue
exposes `price_reduction` with the previous price and the 30-day minimum so the
storefront can display "Najniższa cena z 30 dni przed obniżką".
"""
import datetime as dt

WINDOW = dt.timedelta(days=30)


def stamp(moment=None):
    return (moment or dt.datetime.now(dt.timezone.utc)).isoformat(timespec='seconds')


def init_schema(c):
    c.execute('''CREATE TABLE IF NOT EXISTS product_prices(
        id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
        price INTEGER NOT NULL CHECK(price >= 0), changed_at TEXT NOT NULL, actor_id INTEGER)''')
    c.execute('CREATE INDEX IF NOT EXISTS product_prices_product ON product_prices(product_id,changed_at)')
    for row in c.execute('SELECT id,price FROM products').fetchall():
        if not c.execute('SELECT 1 FROM product_prices WHERE product_id=? LIMIT 1', (row['id'],)).fetchone():
            c.execute('INSERT INTO product_prices(product_id,price,changed_at) VALUES(?,?,?)', (row['id'], row['price'], stamp()))


def record(c, product_id, price, actor_id=None, moment=None):
    """Append a history row when the price actually changes."""
    last = c.execute('SELECT price FROM product_prices WHERE product_id=? ORDER BY id DESC LIMIT 1', (product_id,)).fetchone()
    if last and last['price'] == price:
        return False
    c.execute('INSERT INTO product_prices(product_id,price,changed_at,actor_id) VALUES(?,?,?,?)', (product_id, price, stamp(moment), actor_id))
    return True


def _parse(value):
    return dt.datetime.fromisoformat(value)


def reduction(c, product_id, now=None):
    """None, or {'previous','lowest_30d','since'} when a reduction within 30 days is in force."""
    rows = [dict(row) for row in c.execute('SELECT price,changed_at FROM product_prices WHERE product_id=? ORDER BY id', (product_id,))]
    if len(rows) < 2:
        return None
    now = now or dt.datetime.now(dt.timezone.utc)
    latest = rows[-1]
    previous = rows[-2]
    changed = _parse(latest['changed_at'])
    if latest['price'] >= previous['price'] or changed < now - WINDOW:
        return None
    window_start = changed - WINDOW
    in_window = [row['price'] for row in rows[:-1] if _parse(row['changed_at']) >= window_start]
    before = [row for row in rows[:-1] if _parse(row['changed_at']) < window_start]
    candidates = in_window + ([before[-1]['price']] if before else [])
    lowest = min(candidates) if candidates else previous['price']
    return {'previous': previous['price'], 'lowest_30d': lowest, 'since': latest['changed_at']}


def history(c, product_id, limit=20):
    return [dict(row) for row in c.execute('SELECT price,changed_at,actor_id FROM product_prices WHERE product_id=? ORDER BY id DESC LIMIT ?', (product_id, limit))]
