"""Returns, complaints and post-sale cancellations with stock and refund bookkeeping.

A return request can be registered by the customer (with the private tracking
token) or by staff. Staff decide acceptance, restocking and the refund route:
PayU refunds go through the provider adapter, cash refunds are booked on the
open shift, bank transfers are recorded manually. HTTP owns the transaction.
"""
import datetime as dt
import json

import commerce_sales as sales

KINDS = ('zwrot', 'reklamacja')
STATES = ('zgloszony', 'przyjety', 'odrzucony', 'rozliczony')
REFUND_METHODS = ('none', 'payu', 'cash', 'terminal', 'transfer')
RETURNABLE = ('wydane', 'wyslane', 'spakowane', 'oplacone', 'do_kompletacji', 'nanoszenie_dtf', 'kontrola_jakosci', 'potwierdzone')
REASONS = {'rozmiar': 'Zły rozmiar', 'wada': 'Wada produktu', 'niezgodny': 'Produkt niezgodny z zamówieniem', 'odstapienie': 'Odstąpienie od umowy (14 dni)', 'inny': 'Inny powód'}


class ReturnError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status, self.code = status, code


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS returns(
            id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
            kind TEXT NOT NULL CHECK(kind IN ('zwrot','reklamacja')),
            status TEXT NOT NULL DEFAULT 'zgloszony' CHECK(status IN ('zgloszony','przyjety','odrzucony','rozliczony')),
            items TEXT NOT NULL, reason TEXT NOT NULL DEFAULT 'inny', description TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '', refund_amount INTEGER NOT NULL DEFAULT 0 CHECK(refund_amount >= 0),
            refund_method TEXT NOT NULL DEFAULT 'none' CHECK(refund_method IN ('none','payu','cash','terminal','transfer')),
            restock INTEGER NOT NULL DEFAULT 1 CHECK(restock IN (0,1)), source TEXT NOT NULL DEFAULT 'customer',
            actor_id INTEGER, shift_id INTEGER, created TEXT NOT NULL, updated TEXT NOT NULL, resolved_at TEXT);
        CREATE INDEX IF NOT EXISTS returns_order ON returns(order_id);
    ''')


def _items(order, raw):
    lines = json.loads(order['items'])
    if not isinstance(raw, list) or not 1 <= len(raw) <= 20:
        raise ReturnError(400, 'Wskaż pozycje do zwrotu (1–20)')
    seen, out = set(), []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ReturnError(400, 'Nieprawidłowa pozycja zwrotu')
        index, qty = entry.get('line_index'), entry.get('qty')
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(lines) or index in seen:
            raise ReturnError(400, 'Nieprawidłowa pozycja zamówienia')
        if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= int(lines[index].get('qty', 1)):
            raise ReturnError(400, 'Ilość zwracana przekracza zamówioną')
        seen.add(index)
        line = lines[index]
        out.append({'line_index': index, 'qty': qty, 'sku': line.get('variant_sku') or line.get('sku'), 'name': line.get('name', ''),
                    'size': line.get('size', 'UNI'), 'unit_price': int(line.get('unit_price', 0)), 'personalized': 'personalization' in line})
    return out


def _text(value, label, maximum, required=False):
    if value is None:
        value = ''
    if not isinstance(value, str) or len(value) > maximum or any(ord(ch) < 32 and ch not in '\n' for ch in value):
        raise ReturnError(400, 'Nieprawidłowe pole: ' + label)
    value = value.strip()
    if required and not value:
        raise ReturnError(400, 'Pole jest wymagane: ' + label)
    return value


def register(c, order_id, data, source='customer', actor_id=None):
    order = c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
    if not order:
        raise ReturnError(404, 'Nie znaleziono zamówienia', 'order_not_found')
    if order['status'] not in RETURNABLE:
        raise ReturnError(409, 'Zwrot można zgłosić tylko dla wydanego lub wysłanego zamówienia', 'order_not_returnable')
    detail = sales.details(c, order_id)
    if source == 'customer' and (not detail or detail['mode'] != 'live'):
        raise ReturnError(409, 'Zamówienie testowe nie podlega zwrotom', 'order_not_returnable')
    if not isinstance(data, dict):
        raise ReturnError(400, 'Oczekiwano danych zgłoszenia')
    kind = data.get('kind', 'zwrot')
    if kind not in KINDS:
        raise ReturnError(400, 'Rodzaj zgłoszenia: zwrot lub reklamacja')
    reason = data.get('reason', 'inny')
    if reason not in REASONS:
        raise ReturnError(400, 'Wybierz powód zgłoszenia')
    items = _items(order, data.get('items'))
    description = _text(data.get('description'), 'opis', 1000, required=kind == 'reklamacja')
    if source == 'customer' and c.execute("SELECT 1 FROM returns WHERE order_id=? AND status IN ('zgloszony','przyjety')", (order_id,)).fetchone():
        raise ReturnError(409, 'Dla tego zamówienia jest już otwarte zgłoszenie', 'return_open')
    now = stamp()
    amount = sum(item['unit_price'] * item['qty'] for item in items)
    rid = c.execute('''INSERT INTO returns(order_id,kind,status,items,reason,description,refund_amount,source,actor_id,created,updated)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?)''', (order_id, kind, 'zgloszony', json.dumps(items, ensure_ascii=False), reason, description, amount, source, actor_id, now, now)).lastrowid
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              ('return', str(rid), f'Zgłoszono {kind} do zamówienia {order_id} ({"klient" if source == "customer" else "obsługa " + str(actor_id)}): {REASONS[reason]}', now))
    return get(c, rid)


def get(c, rid):
    row = c.execute('SELECT * FROM returns WHERE id=?', (rid,)).fetchone()
    if not row:
        raise ReturnError(404, 'Nie znaleziono zgłoszenia', 'return_not_found')
    value = dict(row)
    value['items'] = json.loads(value['items'])
    value['reason_label'] = REASONS.get(value['reason'], value['reason'])
    return value


def for_order(c, order_id):
    return [get(c, row['id']) for row in c.execute('SELECT id FROM returns WHERE order_id=? ORDER BY id', (order_id,))]


def public_for_order(c, order_id):
    keys = ('id', 'kind', 'status', 'items', 'reason', 'reason_label', 'description', 'refund_amount', 'refund_method', 'created', 'resolved_at')
    return [{key: item[key] for key in keys} for item in for_order(c, order_id)]


def listing(c, open_only=True):
    query = 'SELECT r.id FROM returns r' + (" WHERE r.status IN ('zgloszony','przyjety')" if open_only else '') + ' ORDER BY r.id DESC LIMIT 300'
    out = []
    for row in c.execute(query):
        item = get(c, row['id'])
        order = c.execute('SELECT status,total,created FROM orders WHERE id=?', (item['order_id'],)).fetchone()
        detail = sales.details(c, item['order_id'])
        item.update({'order_status': order['status'], 'order_total': order['total'], 'order_created': order['created'],
                     'customer_email': detail['customer_email'] if detail else '', 'customer_name': detail['customer_name'] if detail else '',
                     'payment_method': detail['payment_method'] if detail else None, 'mode': detail['mode'] if detail else 'test'})
        out.append(item)
    return out


def _restock(c, order_id, items, write_off):
    for item in items:
        variant = c.execute('SELECT * FROM product_variants WHERE sku=?', (item['sku'],)).fetchone()
        if not variant:
            continue
        if item['personalized'] and write_off:
            c.execute('INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)',
                      (variant['id'], 0, f'zwrot bez przyjęcia na stan (personalizacja) – zamówienie {order_id}', stamp(), 'returns'))
            continue
        c.execute('UPDATE product_variants SET stock=stock+? WHERE id=?', (item['qty'], variant['id']))
        c.execute('UPDATE products SET stock=stock+? WHERE id=?', (item['qty'], variant['product_id']))
        c.execute('INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)',
                  (variant['id'], item['qty'], f'zwrot – zamówienie {order_id}', stamp(), 'returns'))


def resolve(c, rid, data, actor_id, payments_module, open_shift):
    """Staff transition: przyjety / odrzucony / rozliczony (refund + restock)."""
    current = get(c, rid)
    if not isinstance(data, dict):
        raise ReturnError(400, 'Oczekiwano danych decyzji')
    status = data.get('status', current['status'])
    if status not in STATES:
        raise ReturnError(400, 'Nieprawidłowy status zgłoszenia')
    if current['status'] in ('odrzucony', 'rozliczony') and status != current['status']:
        raise ReturnError(409, 'Zgłoszenie jest już zamknięte', 'return_closed')
    note = _text(data.get('note', current['note']), 'notatka', 500)
    now = stamp()
    order = c.execute('SELECT * FROM orders WHERE id=?', (current['order_id'],)).fetchone()
    detail = sales.details(c, current['order_id'])
    refund_method = data.get('refund_method', current['refund_method'])
    if refund_method not in REFUND_METHODS:
        raise ReturnError(400, 'Nieprawidłowa metoda zwrotu środków')
    amount = data.get('refund_amount', current['refund_amount'])
    already = c.execute("SELECT COALESCE(SUM(refund_amount),0) FROM returns WHERE order_id=? AND status='rozliczony' AND id<>?", (order['id'], current['id'])).fetchone()[0]
    if isinstance(amount, bool) or not isinstance(amount, int) or not 0 <= amount <= order['total'] - already:
        raise ReturnError(400, f'Kwota zwrotu musi mieścić się w pozostałej wartości zamówienia ({(order["total"] - already) / 100:.2f} PLN)')
    if amount and refund_method in ('cash', 'transfer') and detail and detail['payment_status'] not in ('paid', 'partially_refunded'):
        raise ReturnError(409, 'Zamówienie nie było opłacone, nie ma czego zwracać')
    restock = data.get('restock', bool(current['restock']))
    if not isinstance(restock, bool):
        raise ReturnError(400, 'Nieprawidłowy znacznik przyjęcia na stan')
    c.execute('UPDATE returns SET note=?,refund_method=?,refund_amount=?,restock=?,updated=? WHERE id=?',
              (note, refund_method, amount, int(restock), now, rid))
    if status == current['status']:
        return get(c, rid)
    shift_id = None
    if status == 'rozliczony':
        if restock:
            _restock(c, current['order_id'], current['items'], write_off=not data.get('restock_personalized', False))
        if amount > 0:
            if refund_method == 'payu':
                payments_module.request_refund(c, current['order_id'], amount, f'Zwrot #{rid}', actor_id)
            elif refund_method == 'cash':
                shift = open_shift(c)
                if not shift:
                    raise ReturnError(409, 'Zwrot gotówki wymaga otwartej zmiany kasowej', 'shift_required')
                shift_id = shift['id']
                sales.mark_payment(c, current['order_id'], 'refunded' if amount >= order['total'] else 'partially_refunded', f'Zwrot gotówką {amount / 100:.2f} PLN, zgłoszenie #{rid}')
            elif refund_method == 'none':
                raise ReturnError(400, 'Wybierz sposób zwrotu środków lub ustaw kwotę 0', 'refund_method_required')
            else:
                sales.mark_payment(c, current['order_id'], 'refunded' if amount >= order['total'] else 'partially_refunded', f'Zwrot {refund_method} {amount / 100:.2f} PLN, zgłoszenie #{rid}')
        returned_qty = sum(item['qty'] for item in current['items'])
        ordered_qty = sum(int(line.get('qty', 1)) for line in json.loads(order['items']))
        if returned_qty >= ordered_qty and current['kind'] == 'zwrot':
            c.execute("UPDATE orders SET status='zwrot' WHERE id=?", (current['order_id'],))
            c.execute('INSERT INTO events(order_id,created,status) VALUES(?,?,?)', (current['order_id'], now, 'zwrot'))
    c.execute('UPDATE returns SET status=?,shift_id=?,resolved_at=?,updated=? WHERE id=?',
              (status, shift_id, now if status in ('odrzucony', 'rozliczony') else None, now, rid))
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              ('return', str(rid), f'Administrator {actor_id}: {current["kind"]} → {status}' + (f', zwrot {amount / 100:.2f} PLN ({refund_method})' if status == 'rozliczony' and amount else '') + (f'; {note}' if note else ''), now))
    return get(c, rid)


def cancel_after_personalization(c, order_id, actor_id, reason):
    """Manager override: cancel an order whose personalised units were already printed; those units are written off."""
    order = c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
    if not order:
        raise ReturnError(404, 'Nie znaleziono zamówienia', 'order_not_found')
    if order['status'] in ('anulowane', 'wydane', 'wyslane', 'zwrot', 'wyslane_demo'):
        raise ReturnError(409, 'Zamówienie jest już zamknięte', 'order_closed')
    reason = _text(reason, 'powód anulowania', 300, required=True)
    printed = {row['line_index']: row['printed_qty'] for row in c.execute('SELECT line_index,printed_qty FROM fulfillment_lines WHERE order_id=?', (order_id,))}
    started = {row['line_index'] for row in c.execute("SELECT line_index FROM production_tasks WHERE order_id=? AND status NOT IN ('oczekuje','odrzucone')", (order_id,))}
    now = stamp()
    for index, line in enumerate(json.loads(order['items'])):
        sku = line.get('variant_sku') or line.get('sku', '') + '-' + (line.get('size') or 'UNI')
        variant = c.execute('SELECT * FROM product_variants WHERE sku=?', (sku,)).fetchone()
        if not variant or line.get('gift_card') is True:
            continue
        qty = int(line.get('qty', 1))
        lost = min(qty, max(printed.get(index, 0), qty if index in started else 0)) if 'personalization' in line else 0
        keep = qty - lost
        if keep:
            c.execute('UPDATE product_variants SET stock=stock+? WHERE id=?', (keep, variant['id']))
            c.execute('UPDATE products SET stock=stock+? WHERE id=?', (keep, variant['product_id']))
            c.execute('INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)', (variant['id'], keep, 'zwrot rezerwacji po anulowaniu', now, 'orders'))
        if lost:
            c.execute('INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)', (variant['id'], 0, f'odpis {lost} szt. spersonalizowanych po anulowaniu ({reason})', now, 'orders'))
    for task in c.execute('SELECT id,batch_id,status FROM production_tasks WHERE order_id=?', (order_id,)).fetchall():
        if task['status'] == 'oczekuje':
            line_qty = next((int(line.get('qty', 1)) for index, line in enumerate(json.loads(order['items'])) if index == c.execute('SELECT line_index FROM production_tasks WHERE id=?', (task['id'],)).fetchone()[0]), 1)
            c.execute('UPDATE dtf_batches SET available=available+? WHERE id=?', (line_qty, task['batch_id']))
        c.execute("UPDATE production_tasks SET status='odrzucone',updated=? WHERE id=?", (now, task['id']))
    c.execute("UPDATE orders SET status='anulowane' WHERE id=?", (order_id,))
    c.execute('INSERT INTO events(order_id,created,status) VALUES(?,?,?)', (order_id, now, 'anulowane'))
    detail = sales.details(c, order_id)
    if detail and detail['payment_status'] == 'paid':
        sales.mark_payment(c, order_id, 'paid', 'Anulowano po personalizacji, rozlicz zwrot w zgłoszeniach')
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              ('order', str(order_id), f'Administrator {actor_id}: anulowano po rozpoczęciu personalizacji; powód: {reason}', now))
    return {'ok': True, 'status': 'anulowane'}
