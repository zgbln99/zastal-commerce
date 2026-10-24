"""Transactional POS (test and live), cash shifts and per-order-line fulfillment progress.

The HTTP layer owns authorization and BEGIN IMMEDIATE/commit/rollback. These
helpers never commit, reserve external payments, or issue fiscal receipts: a
live sale only records the number of the document printed by the club's own
fiscal device.
"""
import datetime as dt
import hashlib
import json
import re
import secrets

import commerce_personalization as personalization

CLOSED = ('anulowane', 'wyslane_demo', 'wydane', 'wyslane', 'zwrot')
WAITING = ('oczekuje_platnosci',)
PAYMENTS = ('cash', 'terminal')
FISCAL_KINDS = ('paragon', 'faktura')
PAYMENT_LABELS = {'cash': 'Gotówka', 'terminal': 'Terminal płatniczy'}


class OpsError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status = status
        self.code = code


def _stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS pos_sales(
            order_id INTEGER PRIMARY KEY REFERENCES orders(id),
            idempotency_key TEXT UNIQUE NOT NULL,
            fingerprint TEXT NOT NULL,
            payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','terminal')),
            actor_id INTEGER NOT NULL,
            demo INTEGER NOT NULL DEFAULT 1 CHECK(demo IN (0,1)),
            shift_id INTEGER, discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0),
            discount_reason TEXT NOT NULL DEFAULT '', fiscal_kind TEXT NOT NULL DEFAULT '',
            fiscal_number TEXT NOT NULL DEFAULT '', cash_received INTEGER NOT NULL DEFAULT 0,
            change_due INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS pos_shifts(
            id INTEGER PRIMARY KEY AUTOINCREMENT, register TEXT NOT NULL DEFAULT 'Kasa 1',
            opened_by INTEGER NOT NULL, opened_at TEXT NOT NULL, opening_cash INTEGER NOT NULL DEFAULT 0,
            closed_by INTEGER, closed_at TEXT, closing_cash INTEGER, expected_cash INTEGER, note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')));
        CREATE TABLE IF NOT EXISTS fulfillment_revisions(
            order_id INTEGER PRIMARY KEY REFERENCES orders(id),
            revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0));
        CREATE TABLE IF NOT EXISTS fulfillment_lines(
            order_id INTEGER NOT NULL REFERENCES orders(id),
            line_index INTEGER NOT NULL CHECK(line_index >= 0),
            picked_qty INTEGER NOT NULL DEFAULT 0 CHECK(picked_qty >= 0),
            printed_qty INTEGER NOT NULL DEFAULT 0 CHECK(printed_qty >= 0),
            checked_qty INTEGER NOT NULL DEFAULT 0 CHECK(checked_qty >= 0),
            PRIMARY KEY(order_id,line_index));
    ''')
    definition = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='pos_sales'").fetchone()[0]
    if 'CHECK(demo=1)' in definition:
        # Legacy demo-only table: rebuild once so live sales can be recorded; rows and keys are kept.
        c.executescript('''
            PRAGMA foreign_keys=OFF;
            BEGIN;
            CREATE TABLE pos_sales_v2(
                order_id INTEGER PRIMARY KEY REFERENCES orders(id),
                idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
                payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','terminal')),
                actor_id INTEGER NOT NULL, demo INTEGER NOT NULL DEFAULT 1 CHECK(demo IN (0,1)),
                shift_id INTEGER, discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0),
                discount_reason TEXT NOT NULL DEFAULT '', fiscal_kind TEXT NOT NULL DEFAULT '',
                fiscal_number TEXT NOT NULL DEFAULT '', cash_received INTEGER NOT NULL DEFAULT 0,
                change_due INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT '');
            INSERT INTO pos_sales_v2(order_id,idempotency_key,fingerprint,payment_method,actor_id,demo)
                SELECT order_id,idempotency_key,fingerprint,payment_method,actor_id,demo FROM pos_sales;
            DROP TABLE pos_sales;
            ALTER TABLE pos_sales_v2 RENAME TO pos_sales;
            COMMIT;
            PRAGMA foreign_keys=ON;
        ''')


def _integer(value, minimum=0, maximum=2147483647):
    if type(value) is not int or not minimum <= value <= maximum:
        raise OpsError(400, 'Nieprawidłowa liczba lub ilość')
    return value


def _audit(c, kind, oid, actor_id, note):
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              (kind, str(oid), f'Administrator {actor_id}: {note}'[:300], _stamp()))


def _normalized_sale(data):
    if not isinstance(data, dict):
        raise OpsError(400, 'Oczekiwano danych sprzedaży')
    key = data.get('idempotency_key')
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', key):
        raise OpsError(400, 'Nieprawidłowy identyfikator sprzedaży')
    payment = data.get('payment_method')
    if payment not in ('cash', 'terminal') or data.get('payment_confirmed') is not True:
        raise OpsError(400, 'Potwierdź testową płatność gotówką lub terminalem')
    customer = data.get('customer_id')
    if customer is not None:
        _integer(customer, 1)
    discount = data.get('discount', 0)
    if isinstance(discount, bool) or not isinstance(discount, int) or not 0 <= discount <= 10000000:
        raise OpsError(400, 'Rabat podaj w groszach (0 lub więcej)')
    reason = data.get('discount_reason', '')
    if not isinstance(reason, str) or len(reason) > 120 or any(ord(ch) < 32 for ch in reason):
        raise OpsError(400, 'Nieprawidłowy powód rabatu')
    if discount and len(reason.strip()) < 3:
        raise OpsError(400, 'Rabat wymaga powodu (np. pracownik klubu, uszkodzenie)', 'discount_reason_required')
    fiscal = data.get('fiscal')
    if fiscal is not None:
        if (not isinstance(fiscal, dict) or fiscal.get('kind') not in FISCAL_KINDS or not isinstance(fiscal.get('number'), str)
                or not re.fullmatch(r'[A-Za-z0-9/_. -]{1,40}', fiscal['number'].strip())):
            raise OpsError(400, 'Podaj rodzaj i numer dokumentu z kasy fiskalnej (paragon lub faktura)', 'fiscal_document_required')
        fiscal = {'kind': fiscal['kind'], 'number': fiscal['number'].strip()}
    cash_received = data.get('cash_received', 0)
    if isinstance(cash_received, bool) or not isinstance(cash_received, int) or not 0 <= cash_received <= 100000000:
        raise OpsError(400, 'Nieprawidłowa kwota przyjętej gotówki')
    handover = data.get('handover', False)
    if not isinstance(handover, bool):
        raise OpsError(400, 'Nieprawidłowy znacznik wydania')
    lines = data.get('items')
    if not isinstance(lines, list) or not 1 <= len(lines) <= 20:
        raise OpsError(400, 'Koszyk musi zawierać od 1 do 20 pozycji')
    normalized = []
    for line in lines:
        if not isinstance(line, dict):
            raise OpsError(400, 'Nieprawidłowa pozycja koszyka')
        size = line.get('size', 'UNI')
        if not isinstance(size, str) or not 1 <= len(size.strip()) <= 10:
            raise OpsError(400, 'Nieprawidłowy rozmiar')
        item = {'id': _integer(line.get('id'), 1), 'size': size.strip().upper(),
                'quantity': _integer(line.get('quantity'), 1, 20)}
        if 'personalization' in line:
            try:
                item['personalization'] = personalization.normalize_request(line['personalization'])
            except ValueError as ex:
                raise OpsError(400, str(ex), 'invalid_personalization') from ex
        normalized.append(item)
    identity = {'items': normalized, 'payment_method': payment, 'customer_id': customer}
    extras = {'discount': discount, 'discount_reason': reason.strip(), 'fiscal': fiscal, 'cash_received': cash_received, 'handover': handover}
    if discount or fiscal or cash_received or handover:
        identity['extras'] = extras
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    return key, payment, customer, normalized, fingerprint, extras


def _sale_result(c, oid, replayed):
    row = c.execute('''SELECT o.id,o.total,o.items,o.status,r.tracking_token,s.demo,s.discount,s.discount_reason,s.fiscal_kind,
        s.fiscal_number,s.cash_received,s.change_due,s.payment_method,s.shift_id FROM orders o
        JOIN order_receipts r ON r.order_id=o.id JOIN pos_sales s ON s.order_id=o.id WHERE o.id=?''', (oid,)).fetchone()
    return {'id': row['id'], 'total': row['total'], 'items': json.loads(row['items']), 'status': row['status'],
            'tracking_token': row['tracking_token'], 'demo': bool(row['demo']), 'replayed': replayed,
            'payment_method': row['payment_method'], 'discount': row['discount'], 'discount_reason': row['discount_reason'],
            'fiscal': {'kind': row['fiscal_kind'], 'number': row['fiscal_number']} if row['fiscal_number'] else None,
            'cash_received': row['cash_received'], 'change_due': row['change_due'], 'shift_id': row['shift_id']}


def open_shift(c, register):
    return c.execute("SELECT * FROM pos_shifts WHERE status='open' AND register=? ORDER BY id DESC LIMIT 1", (register,)).fetchone()


def create_sale(c, data, actor_id, live=False, can_discount=False, register='Kasa 1'):
    """Records a counter sale. live=True requires an open shift and a fiscal document number."""
    _integer(actor_id, 1)
    key, payment, customer, lines, fingerprint, extras = _normalized_sale(data)
    previous = c.execute('SELECT * FROM pos_sales WHERE idempotency_key=?', (key,)).fetchone()
    if previous:
        if previous['fingerprint'] != fingerprint:
            raise OpsError(409, 'Ten identyfikator jest przypisany do innej sprzedaży', 'idempotency_conflict')
        return _sale_result(c, previous['order_id'], True)
    if customer is not None and not c.execute(
            "SELECT 1 FROM users WHERE id=? AND role='customer' AND active=1", (customer,)).fetchone():
        raise OpsError(400, 'Wybierz aktywne konto klienta', 'invalid_customer')
    if extras['discount'] and not can_discount:
        raise OpsError(403, 'Rabat może zatwierdzić menedżer sklepu', 'discount_not_allowed')
    shift = open_shift(c, register)
    if live and not shift:
        raise OpsError(409, 'Otwórz zmianę kasową przed sprzedażą', 'shift_required')
    if live and not extras['fiscal']:
        raise OpsError(400, 'Wpisz numer paragonu lub faktury z kasy fiskalnej', 'fiscal_document_required')
    result = []
    total = 0
    for line in lines:
        pid, size, qty = line['id'], line['size'], line['quantity']
        product = c.execute('SELECT * FROM products WHERE id=?', (pid,)).fetchone()
        variant = c.execute('SELECT * FROM product_variants WHERE product_id=? AND size=?', (pid, size)).fetchone()
        if not product or not variant:
            raise OpsError(400, 'Wybierz istniejący wariant', 'invalid_variant')
        if variant['stock'] < qty:
            raise OpsError(409, 'Niewystarczająca dostępność wariantu ' + size, 'insufficient_stock')
        try:
            printed, fee = personalization.snapshot(c, pid, line.get('personalization'))
            if printed is not None:
                _validate_print(printed)
        except ValueError as ex:
            raise OpsError(400, str(ex), 'invalid_personalization') from ex
        unit_price = product['price'] + fee
        item = {'id': pid, 'variant_id': variant['id'], 'sku': product['sku'],
                'variant_sku': variant['sku'], 'ean': variant['ean'], 'name': product['name'],
                'size': size, 'qty': qty, 'base_unit_price': product['price'],
                'personalization_fee': fee, 'unit_price': unit_price}
        if printed is not None:
            item['personalization'] = printed
        facts = personalization.line_extras(c, pid)
        if printed is not None:
            item.update({key: facts[key] for key in ('decoration_method', 'print_layout') if key in facts})
        if 'preorder' in facts:
            item['preorder'] = facts['preorder']
        result.append(item)
        total += unit_price * qty
        c.execute('UPDATE product_variants SET stock=stock-? WHERE id=?', (qty, variant['id']))
        c.execute('''INSERT INTO stock_events(variant_id,delta,reason,created,source)
            VALUES(?,?,?,?,?)''', (variant['id'], -qty, 'sprzedaż POS demonstracyjna', _stamp(), 'pos-demo'))
    for pid in {line['id'] for line in lines}:
        c.execute('''UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0)
            FROM product_variants WHERE product_id=?) WHERE id=?''', (pid, pid))
    subtotal = total
    discount = extras['discount']
    if discount > subtotal:
        raise OpsError(400, 'Rabat nie może przekraczać wartości koszyka', 'discount_too_high')
    total = subtotal - discount
    if payment == 'cash' and extras['cash_received'] and extras['cash_received'] < total:
        raise OpsError(400, 'Przyjęta gotówka jest niższa niż kwota do zapłaty', 'cash_insufficient')
    change = extras['cash_received'] - total if payment == 'cash' and extras['cash_received'] else 0
    needs_work = any('personalization' in item for item in result)
    status = 'do_kompletacji' if needs_work or not extras['handover'] else 'wydane'
    now = _stamp()
    oid = c.execute('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',
                    (now, json.dumps(result, ensure_ascii=False), total, status)).lastrowid
    token = secrets.token_urlsafe(32)
    # Prefix includes ':' which public checkout keys cannot contain, avoiding collisions.
    c.execute('''INSERT INTO order_receipts(order_id,tracking_token,fulfillment,shipping_fee,
        subtotal,idempotency_key,fingerprint,customer_id) VALUES(?,?,?,?,?,?,?,?)''',
              (oid, token, 'odbior', 0, subtotal, 'pos:' + key, fingerprint, customer))
    fiscal = extras['fiscal'] or {'kind': '', 'number': ''}
    c.execute('''INSERT INTO pos_sales(order_id,idempotency_key,fingerprint,payment_method,actor_id,demo,shift_id,discount,
        discount_reason,fiscal_kind,fiscal_number,cash_received,change_due,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
              (oid, key, fingerprint, payment, actor_id, 0 if live else 1, shift['id'] if shift else None, discount,
               extras['discount_reason'], fiscal['kind'], fiscal['number'], extras['cash_received'], change, now))
    c.execute('''INSERT INTO order_details(order_id,mode,customer_email,shipping_code,shipping_name,shipping_kind,payment_method,
        payment_status,paid_at,paid_amount,payment_note,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
              (oid, 'live' if live else 'test', '', 'odbior', 'Sprzedaż stacjonarna', 'pickup', 'pos_' + payment,
               'paid', now, total, f'POS {PAYMENT_LABELS[payment]}' + (f'; {fiscal["kind"]} {fiscal["number"]}' if fiscal['number'] else ''), now, now))
    c.execute('INSERT INTO fulfillment_revisions(order_id) VALUES(?)', (oid,))
    c.execute('INSERT INTO events(order_id,created,status) VALUES(?,?,?)', (oid, now, status))
    label = 'Sprzedaż stacjonarna' if live else 'Sprzedaż demonstracyjna'
    _audit(c, 'pos-sale', oid, actor_id, f'{label}; {PAYMENT_LABELS[payment]}; suma {total} gr'
           + (f'; rabat {discount} gr ({extras["discount_reason"]})' if discount else '') + (f'; {fiscal["kind"]} {fiscal["number"]}' if fiscal['number'] else ''))
    return _sale_result(c, oid, False)


def _cash(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100000000:
        raise OpsError(400, f'Nieprawidłowa kwota: {label}')
    return value


def shift_summary(c, shift):
    """Totals of live sales booked on the shift, by payment method."""
    rows = c.execute('''SELECT s.payment_method,COUNT(*) AS sales,COALESCE(SUM(o.total),0) AS total,COALESCE(SUM(s.discount),0) AS discounts
        FROM pos_sales s JOIN orders o ON o.id=s.order_id WHERE s.shift_id=? AND s.demo=0 GROUP BY s.payment_method''', (shift['id'],)).fetchall()
    by_method = {method: {'sales': 0, 'total': 0} for method in PAYMENTS}
    discounts = 0
    for row in rows:
        by_method[row['payment_method']] = {'sales': row['sales'], 'total': row['total']}
        discounts += row['discounts']
    refunds = c.execute('''SELECT COALESCE(SUM(r.refund_amount),0) FROM returns r JOIN pos_sales s ON s.order_id=r.order_id
        WHERE r.status='refunded' AND r.refund_method='cash' AND r.shift_id=?''', (shift['id'],)).fetchone()[0] if _table(c, 'returns') else 0
    expected = shift['opening_cash'] + by_method['cash']['total'] - refunds
    value = dict(shift)
    value.update({'by_method': by_method, 'discounts': discounts, 'cash_refunds': refunds, 'expected_cash': expected,
                  'sales': sum(item['sales'] for item in by_method.values()), 'turnover': sum(item['total'] for item in by_method.values())})
    if shift['status'] == 'closed' and shift['closing_cash'] is not None:
        value['difference'] = shift['closing_cash'] - expected
    return value


def _table(c, name):
    return bool(c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone())


def start_shift(c, data, actor_id, register='Kasa 1'):
    _integer(actor_id, 1)
    if not isinstance(data, dict):
        raise OpsError(400, 'Oczekiwano danych zmiany')
    if open_shift(c, register):
        raise OpsError(409, 'Zmiana kasowa jest już otwarta', 'shift_open')
    opening = _cash(data.get('opening_cash', 0), 'gotówka początkowa')
    now = _stamp()
    sid = c.execute('INSERT INTO pos_shifts(register,opened_by,opened_at,opening_cash) VALUES(?,?,?,?)', (register, actor_id, now, opening)).lastrowid
    _audit(c, 'pos-shift', sid, actor_id, f'Otwarto zmianę {register}; gotówka początkowa {opening} gr')
    return shift_summary(c, c.execute('SELECT * FROM pos_shifts WHERE id=?', (sid,)).fetchone())


def close_shift(c, data, actor_id, register='Kasa 1'):
    _integer(actor_id, 1)
    if not isinstance(data, dict):
        raise OpsError(400, 'Oczekiwano danych zamknięcia')
    shift = open_shift(c, register)
    if not shift:
        raise OpsError(409, 'Brak otwartej zmiany', 'shift_missing')
    closing = _cash(data.get('closing_cash'), 'gotówka policzona')
    note = data.get('note', '')
    if not isinstance(note, str) or len(note) > 300:
        raise OpsError(400, 'Nieprawidłowa notatka')
    summary = shift_summary(c, shift)
    now = _stamp()
    c.execute("UPDATE pos_shifts SET status='closed',closed_by=?,closed_at=?,closing_cash=?,expected_cash=?,note=? WHERE id=?",
              (actor_id, now, closing, summary['expected_cash'], note.strip(), shift['id']))
    _audit(c, 'pos-shift', shift['id'], actor_id, f'Zamknięto zmianę; oczekiwano {summary["expected_cash"]} gr, policzono {closing} gr, różnica {closing - summary["expected_cash"]:+} gr')
    return shift_summary(c, c.execute('SELECT * FROM pos_shifts WHERE id=?', (shift['id'],)).fetchone())


def shifts(c, register='Kasa 1', limit=30):
    current = open_shift(c, register)
    rows = c.execute("SELECT * FROM pos_shifts WHERE register=? ORDER BY id DESC LIMIT ?", (register, limit)).fetchall()
    return {'register': register, 'current': shift_summary(c, current) if current else None,
            'history': [shift_summary(c, row) for row in rows if row['status'] == 'closed']}


def shift_sales(c, shift_id):
    rows = c.execute('''SELECT o.id,o.created,o.total,o.status,s.payment_method,s.discount,s.fiscal_kind,s.fiscal_number,s.actor_id
        FROM pos_sales s JOIN orders o ON o.id=s.order_id WHERE s.shift_id=? ORDER BY o.id''', (shift_id,)).fetchall()
    return [dict(row) for row in rows]


def _validate_print(value):
    if not isinstance(value, dict) or value.get('mode') not in ('custom', 'player'):
        raise ValueError('Nieprawidłowy zapis nadruku')
    if personalization.print_name(value.get('name')) != value.get('name'):
        raise ValueError('Nieprawidłowe nazwisko w zapisie nadruku')
    personalization.print_number(value.get('number'))
    if value['mode'] == 'player':
        personalization.integer(value.get('player_id'), 'zawodnik', 1, 2147483647)


def _order(c, oid):
    _integer(oid, 1)
    order = c.execute('SELECT * FROM orders WHERE id=?', (oid,)).fetchone()
    if order is None:
        raise OpsError(404, 'Nie znaleziono zamówienia', 'order_not_found')
    return dict(order)


def detail(c, order_id):
    order = _order(c, order_id)
    try:
        items = json.loads(order['items'])
        if not isinstance(items, list) or not items:
            raise ValueError('Puste zamówienie')
        for item in items:
            if not isinstance(item, dict) or type(item.get('qty')) is not int or not 1 <= item['qty'] <= 100000:
                raise ValueError('Nieprawidłowa ilość w zamówieniu')
            if 'personalization' in item:
                _validate_print(item['personalization'])
    except (TypeError, ValueError) as ex:
        raise OpsError(409, 'Zamówienie zawiera nieprawidłowy zapis pozycji lub nadruku', 'invalid_order_snapshot') from ex
    progress = {row['line_index']: dict(row) for row in c.execute(
        'SELECT * FROM fulfillment_lines WHERE order_id=?', (order_id,))}
    production = {row['line_index']: dict(row) for row in c.execute(
        'SELECT * FROM production_tasks WHERE order_id=?', (order_id,))}
    ready = True
    for index, item in enumerate(items):
        state = progress.get(index, {})
        item.update({'line_index': index, **{key: state.get(key, 0) for key in ('picked_qty', 'printed_qty', 'checked_qty')}})
        item['print_required'] = 'personalization' in item or index in production
        item['production_ready'] = index not in production or production[index]['status'] == 'gotowe'
        if index in production:
            item['production'] = production[index]
        ready &= (item['picked_qty'] == item['qty'] and item['checked_qty'] == item['qty']
                  and item['production_ready']
                  and (not item['print_required'] or item['printed_qty'] == item['qty']))
    revision = c.execute('SELECT revision FROM fulfillment_revisions WHERE order_id=?', (order_id,)).fetchone()
    receipt = c.execute('SELECT fulfillment,shipping_fee,subtotal,customer_id FROM order_receipts WHERE order_id=?', (order_id,)).fetchone()
    sale = c.execute('SELECT payment_method,demo FROM pos_sales WHERE order_id=?', (order_id,)).fetchone()
    order.update({'items': items, 'revision': revision['revision'] if revision else 0,
                  'demo': not (sale and sale['demo'] == 0) and not _live_order(c, order_id), 'source': 'pos' if sale else 'checkout',
                  'ready_to_pack': bool(ready and order['status'] not in (*CLOSED, 'spakowane')),
                  'ready_to_handover': bool(ready and order['status'] == 'spakowane')})
    if receipt:
        order.update(dict(receipt))
    if sale:
        order['payment_method'] = sale['payment_method']
    order['events'] = [dict(row) for row in c.execute('SELECT created,status FROM events WHERE order_id=? ORDER BY id', (order_id,))]
    return order


def _live_order(c, order_id):
    if not _table(c, 'order_details'):
        return False
    row = c.execute('SELECT mode FROM order_details WHERE order_id=?', (order_id,)).fetchone()
    return bool(row) and row['mode'] == 'live'


def queue(c):
    skipped = CLOSED + WAITING
    placeholders = ','.join('?' for _ in skipped)
    ids = c.execute(f'SELECT id FROM orders WHERE status NOT IN ({placeholders}) ORDER BY id LIMIT 300', skipped).fetchall()
    return [detail(c, row['id']) for row in ids]


def _mutable(c, oid, data, actor_id):
    _integer(actor_id, 1)
    if not isinstance(data, dict):
        raise OpsError(400, 'Oczekiwano danych postępu')
    revision = _integer(data.get('revision'))
    value = detail(c, oid)
    if value['status'] in CLOSED:
        raise OpsError(409, 'Zamówienie zostało zamknięte', 'order_closed')
    if value['status'] in WAITING:
        raise OpsError(409, 'Zamówienie czeka na płatność', 'order_unpaid')
    if revision != value['revision']:
        raise OpsError(409, 'Postęp zmienił się. Odśwież zamówienie', 'stale_revision')
    return value


def _advance(c, oid, revision, status, actor_id, note):
    c.execute('INSERT OR IGNORE INTO fulfillment_revisions(order_id) VALUES(?)', (oid,))
    changed = c.execute('UPDATE fulfillment_revisions SET revision=revision+1 WHERE order_id=? AND revision=?', (oid, revision))
    if changed.rowcount != 1:
        raise OpsError(409, 'Postęp zmienił się. Odśwież zamówienie', 'stale_revision')
    c.execute('UPDATE orders SET status=? WHERE id=?', (status, oid))
    c.execute('INSERT INTO events(order_id,created,status) VALUES(?,?,?)', (oid, _stamp(), status))
    _audit(c, 'fulfillment', oid, actor_id, note)


def _scan_matches(c, item, code):
    sku = item.get('variant_sku')
    size = item.get('size') or 'UNI'
    if not sku:
        legacy = c.execute('SELECT sku FROM product_variants WHERE sku=? AND size=?',
                           (item.get('sku'), size)).fetchone()
        sku = legacy['sku'] if legacy else str(item.get('sku', '')) + '-' + str(size)
    if not isinstance(sku, str) or not sku:
        return False
    eans = {item.get('ean')}
    current = c.execute('SELECT ean FROM product_variants WHERE sku=?', (sku,)).fetchone()
    if current:
        eans.add(current['ean'])
    value = code.strip()
    if value.startswith('ZASTAL|'):
        parts = value.split('|')
        return len(parts) == 3 and parts[1].lower() == sku.lower() and parts[2] in eans
    return value.lower() == sku.lower() or value in eans


def update_line(c, order_id, data, actor_id):
    value = _mutable(c, order_id, data, actor_id)
    if value['status'] == 'spakowane':
        raise OpsError(409, 'Zamówienie jest już spakowane', 'order_packed')
    index = _integer(data.get('line_index'))
    if index >= len(value['items']):
        raise OpsError(400, 'Nieprawidłowa pozycja zamówienia')
    action = data.get('action')
    if not isinstance(action, str) or action not in ('pick', 'print', 'check') or type(data.get('quantity')) is not int or data['quantity'] != 1:
        raise OpsError(400, 'Potwierdź jedną sztukę: kompletacja, nadruk lub kontrola')
    item = value['items'][index]
    code = data.get('code')
    if code is not None:
        if not isinstance(code, str) or not 1 <= len(code.strip()) <= 200:
            raise OpsError(400, 'Nieprawidłowy kod skanera')
        if not _scan_matches(c, item, code):
            raise OpsError(409, 'Zeskanowany kod nie odpowiada tej pozycji', 'scanner_mismatch')
    counter = {'pick': 'picked_qty', 'print': 'printed_qty', 'check': 'checked_qty'}[action]
    if item[counter] >= item['qty']:
        raise OpsError(409, 'Wszystkie sztuki tej pozycji zostały już potwierdzone', 'quantity_complete')
    if action == 'print' and (not item['print_required'] or item['printed_qty'] >= item['picked_qty']):
        raise OpsError(409, 'Najpierw skompletuj sztukę wymagającą nadruku', 'progress_prerequisite')
    if action == 'print' and not item['production_ready']:
        raise OpsError(409, 'Najpierw zakończ zlecenie produkcyjne dla tej pozycji', 'production_not_ready')
    if action == 'check' and (item['checked_qty'] >= item['picked_qty'] or
                            (item['print_required'] and item['checked_qty'] >= item['printed_qty'])):
        raise OpsError(409, 'Najpierw skompletuj sztukę i potwierdź wymagany nadruk', 'progress_prerequisite')
    c.execute('INSERT OR IGNORE INTO fulfillment_lines(order_id,line_index) VALUES(?,?)', (order_id, index))
    # Counter is selected exclusively from the fixed mapping above.
    c.execute(f'UPDATE fulfillment_lines SET {counter}={counter}+1 WHERE order_id=? AND line_index=?', (order_id, index))
    item[counter] += 1
    # Overall stage follows remaining work, so checking one line cannot hide another.
    if any(line['picked_qty'] < line['qty'] for line in value['items']):
        status = 'do_kompletacji'
    elif any(not line['production_ready'] or (line['print_required'] and line['printed_qty'] < line['qty']) for line in value['items']):
        status = 'nanoszenie_dtf'
    else:
        status = 'kontrola_jakosci'
    _advance(c, order_id, value['revision'], status, actor_id, f'{action}; pozycja {index}; sztuka {item[counter]}')
    return detail(c, order_id)


def complete(c, order_id, data, actor_id):
    value = _mutable(c, order_id, data, actor_id)
    action = data.get('action')
    if action == 'pack':
        if value['status'] == 'spakowane':
            raise OpsError(409, 'Zamówienie jest już spakowane', 'order_packed')
        if not value['ready_to_pack']:
            raise OpsError(409, 'Potwierdź wszystkie sztuki, nadruki i kontrolę jakości', 'fulfillment_not_ready')
        status = 'spakowane'
    elif action == 'handover':
        if not value['ready_to_handover']:
            raise OpsError(409, 'Najpierw spakuj zamówienie', 'fulfillment_not_ready')
        status = 'wydane'
    else:
        raise OpsError(400, 'Wybierz pakowanie lub wydanie')
    _advance(c, order_id, value['revision'], status, actor_id, action)
    return detail(c, order_id)
