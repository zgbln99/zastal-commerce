"""PayU REST API v2.1 adapter: OAuth, order creation, signed notifications, refunds.

Credentials live only in the protected runtime environment. Without them the
adapter reports "not configured" and live checkout cannot offer online payment.
Notifications are verified with the OpenPayu-Signature header (second key),
deduplicated by body digest and applied idempotently. No card data is ever
handled here: customers pay on PayU's hosted page.
"""
import datetime as dt
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import commerce_sales as sales

PROVIDER = 'payu'
HOSTS = {'sandbox': 'https://secure.snd.payu.com', 'production': 'https://secure.payu.com'}
STATES = ('new', 'pending', 'completed', 'canceled', 'rejected', 'failed')
_token_cache = {'value': '', 'expires': 0}
_token_lock = threading.Lock()


class PaymentError(Exception):
    def __init__(self, status, message, code='payment_error'):
        super().__init__(message)
        self.status, self.code = status, code


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS payments(
            id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
            provider TEXT NOT NULL DEFAULT 'payu', ext_order_id TEXT UNIQUE NOT NULL,
            provider_order_id TEXT, status TEXT NOT NULL DEFAULT 'new'
                CHECK(status IN ('new','pending','completed','canceled','rejected','failed')),
            amount INTEGER NOT NULL CHECK(amount > 0), currency TEXT NOT NULL DEFAULT 'PLN',
            redirect_url TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL,
            created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
        CREATE TABLE IF NOT EXISTS payment_notifications(
            id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, body_hash TEXT UNIQUE NOT NULL,
            ext_order_id TEXT, result TEXT NOT NULL, received TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS payment_refunds(
            id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id INTEGER NOT NULL REFERENCES payments(id),
            provider_refund_id TEXT, amount INTEGER NOT NULL CHECK(amount > 0), status TEXT NOT NULL DEFAULT 'requested'
                CHECK(status IN ('requested','pending','finalized','canceled','failed')),
            reason TEXT NOT NULL DEFAULT '', actor_id INTEGER, created TEXT NOT NULL, updated TEXT NOT NULL);
    ''')


def configuration():
    env = os.environ.get('ZASTAL_PAYU_ENV', 'sandbox').strip().lower()
    values = {key: os.environ.get('ZASTAL_PAYU_' + key, '').strip() for key in ('POS_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SECOND_KEY')}
    missing = ['ZASTAL_PAYU_' + key for key, value in values.items() if not value]
    if env not in HOSTS:
        missing.append('ZASTAL_PAYU_ENV')
    origin = os.environ.get('ZASTAL_SITE_ORIGIN', '').strip().rstrip('/')
    if not origin.startswith('https://'):
        missing.append('ZASTAL_SITE_ORIGIN')
    return {'provider': PROVIDER, 'configured': not missing, 'environment': env if env in HOSTS else 'sandbox',
            'pos_id': values['POS_ID'], 'missing': missing, 'origin': origin,
            'live_credentials': env == 'production' and not missing}


def ready():
    return configuration()['configured']


def _transport(method, url, headers, body):
    """Single outbound HTTP path; replaced in tests. Never follows redirects."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    request = urllib.request.Request(url, method=method, headers=headers, data=body)
    try:
        with opener.open(request, timeout=20) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


TRANSPORT = _transport


def _call(method, path, body=None, token=None, form=False):
    config = configuration()
    headers = {'Accept': 'application/json'}
    data = None
    if form:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        data = urllib.parse.urlencode(body).encode()
    elif body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body, ensure_ascii=False).encode()
    if token:
        headers['Authorization'] = 'Bearer ' + token
    try:
        status, _, raw = TRANSPORT(method, HOSTS[config['environment']] + path, headers, data)
    except (OSError, ValueError) as ex:
        raise PaymentError(502, 'Operator płatności nie odpowiada. Spróbuj ponownie.', 'provider_unavailable') from ex
    try:
        payload = json.loads(raw.decode('utf-8')) if raw else {}
    except ValueError:
        payload = {}
    return status, payload


def access_token():
    config = configuration()
    if not config['configured']:
        raise PaymentError(503, 'Płatności online nie są skonfigurowane.', 'payment_unconfigured')
    with _token_lock:
        if _token_cache['value'] and _token_cache['expires'] > time.time() + 60:
            return _token_cache['value']
        status, payload = _call('POST', '/pl/standard/user/oauth/authorize', {
            'grant_type': 'client_credentials', 'client_id': os.environ['ZASTAL_PAYU_CLIENT_ID'],
            'client_secret': os.environ['ZASTAL_PAYU_CLIENT_SECRET']}, form=True)
        token = payload.get('access_token') if status == 200 else None
        if not token:
            raise PaymentError(502, 'Nie udało się uwierzytelnić w PayU.', 'provider_auth_failed')
        _token_cache.update(value=token, expires=time.time() + int(payload.get('expires_in', 3600)))
        return token


def clear_token_cache():
    with _token_lock:
        _token_cache.update(value='', expires=0)


def _ext_order_id(order_id):
    return f'ZS-{order_id:05d}-{secrets.token_hex(4)}'


def create_order(c, order, detail, customer_ip, items):
    """Registers a PayU order for an awaiting-payment store order. Returns the payment row."""
    config = configuration()
    if not config['configured']:
        raise PaymentError(503, 'Płatności online nie są skonfigurowane.', 'payment_unconfigured')
    active = c.execute("SELECT * FROM payments WHERE order_id=? AND status IN ('completed') LIMIT 1", (order['id'],)).fetchone()
    if active:
        raise PaymentError(409, 'Zamówienie jest już opłacone.', 'already_paid')
    ext = _ext_order_id(order['id'])
    origin = config['origin']
    body = {
        'notifyUrl': origin + '/api/payments/payu/notify',
        'continueUrl': f"{origin}/zamowienie?id={order['id']}&token={detail['tracking_token']}&payment=return",
        'customerIp': customer_ip or '127.0.0.1',
        'merchantPosId': config['pos_id'],
        'description': f"Zastal Store ZS-{order['id']:05d}",
        'currencyCode': 'PLN',
        'totalAmount': str(order['total']),
        'extOrderId': ext,
        'validityTime': str(max(300, min(sales.settings(c)['unpaid_hours'], 72) * 3600)),
        'buyer': {'email': detail['customer_email'], 'language': 'pl',
                  **({'phone': detail['customer_phone']} if detail['customer_phone'] else {}),
                  'firstName': detail['customer_name'].split(' ', 1)[0][:50] if detail['customer_name'] else '',
                  'lastName': detail['customer_name'].split(' ', 1)[1][:50] if ' ' in detail['customer_name'] else detail['customer_name'][:50]},
        'products': [{'name': (item.get('name') or item.get('sku') or 'Produkt')[:255],
                      'unitPrice': str(item.get('unit_price', 0)), 'quantity': str(item.get('qty', 1))} for item in items],
    }
    if detail.get('shipping_fee'):
        body['products'].append({'name': 'Dostawa', 'unitPrice': str(detail['shipping_fee']), 'quantity': '1'})
    status, payload = _call('POST', '/api/v2_1/orders', body, token=access_token())
    redirect = payload.get('redirectUri', '') if isinstance(payload, dict) else ''
    code = (payload.get('status') or {}).get('statusCode') if isinstance(payload, dict) else None
    if status not in (200, 201, 302) or code != 'SUCCESS' or not isinstance(redirect, str) or not redirect.startswith('https://'):
        c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
                  ('payment', str(order['id']), f'PayU odrzucił utworzenie płatności (HTTP {status}, {code})', stamp()))
        raise PaymentError(502, 'Nie udało się rozpocząć płatności online. Spróbuj ponownie lub wybierz inną metodę.', 'provider_rejected')
    now = stamp()
    cursor = c.execute('''INSERT INTO payments(order_id,provider,ext_order_id,provider_order_id,status,amount,currency,redirect_url,environment,created,updated)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?)''', (order['id'], PROVIDER, ext, str(payload.get('orderId', ''))[:64], 'pending',
                                                            order['total'], 'PLN', redirect, config['environment'], now, now))
    sales.mark_payment(c, order['id'], 'pending', 'PayU: oczekiwanie na płatność')
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              ('payment', str(order['id']), f'Rozpoczęto płatność PayU {ext} ({config["environment"]})', now))
    return dict(c.execute('SELECT * FROM payments WHERE id=?', (cursor.lastrowid,)).fetchone())


def verify_signature(header, raw_body):
    """OpenPayu-Signature: sender=checkout;signature=<hex>;algorithm=MD5|SHA-256;content=DOCUMENT."""
    config = configuration()
    if not config['configured'] or not isinstance(header, str):
        return False
    parts = {}
    for chunk in header.split(';'):
        key, _, value = chunk.strip().partition('=')
        parts[key.strip().lower()] = value.strip()
    algorithm = parts.get('algorithm', 'MD5').upper().replace('-', '')
    digestor = {'MD5': hashlib.md5, 'SHA256': hashlib.sha256, 'SHA1': hashlib.sha1}.get(algorithm)
    signature = parts.get('signature', '')
    if not digestor or not signature:
        return False
    expected = digestor(raw_body + os.environ['ZASTAL_PAYU_SECOND_KEY'].encode()).hexdigest()
    return secrets.compare_digest(expected.lower(), signature.lower())


def handle_notification(c, raw_body, header):
    """Applies a verified notification exactly once; returns (http_status, result_text)."""
    if not verify_signature(header, raw_body):
        return 401, 'invalid_signature'
    digest = hashlib.sha256(raw_body).hexdigest()
    if c.execute('SELECT 1 FROM payment_notifications WHERE body_hash=?', (digest,)).fetchone():
        return 200, 'duplicate'
    try:
        data = json.loads(raw_body.decode('utf-8'))
    except ValueError:
        return 400, 'invalid_json'
    result, ext = 'ignored', None
    if isinstance(data, dict) and isinstance(data.get('order'), dict):
        result, ext = _apply_order_status(c, data['order'])
    elif isinstance(data, dict) and isinstance(data.get('refund'), dict):
        result, ext = _apply_refund_status(c, data)
    c.execute('INSERT INTO payment_notifications(provider,body_hash,ext_order_id,result,received) VALUES(?,?,?,?,?)',
              (PROVIDER, digest, ext, result, stamp()))
    return 200, result


def _apply_order_status(c, order):
    ext = str(order.get('extOrderId', ''))[:64]
    payment = c.execute('SELECT * FROM payments WHERE ext_order_id=?', (ext,)).fetchone()
    if not payment:
        return 'unknown_order', ext
    status = str(order.get('status', '')).upper()
    amount = int(order.get('totalAmount', 0)) if str(order.get('totalAmount', '')).isdigit() else 0
    currency = order.get('currencyCode', 'PLN')
    now = stamp()
    provider_id = str(order.get('orderId', payment['provider_order_id'] or ''))[:64]
    if status == 'COMPLETED':
        if amount != payment['amount'] or currency != payment['currency']:
            c.execute("UPDATE payments SET status='failed',provider_order_id=?,updated=? WHERE id=?", (provider_id, now, payment['id']))
            c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
                      ('payment', str(payment['order_id']), f'PayU COMPLETED z niezgodną kwotą {amount} {currency} vs {payment["amount"]} PLN — wymaga ręcznej weryfikacji', now))
            sales.mark_payment(c, payment['order_id'], 'failed', 'PayU: niezgodna kwota płatności')
            return 'amount_mismatch', ext
        if payment['status'] != 'completed':
            c.execute("UPDATE payments SET status='completed',provider_order_id=?,updated=? WHERE id=?", (provider_id, now, payment['id']))
            changed = sales.mark_paid(c, payment['order_id'], amount, 'PayU', f'{ext} / {provider_id}')
            c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
                      ('payment', str(payment['order_id']), f'PayU potwierdził płatność {ext} ({amount / 100:.2f} PLN)', now))
            return 'completed' if changed else 'already_paid', ext
        return 'already_completed', ext
    if status in ('CANCELED', 'REJECTED'):
        new = 'canceled' if status == 'CANCELED' else 'rejected'
        if payment['status'] not in ('completed',):
            c.execute('UPDATE payments SET status=?,provider_order_id=?,updated=? WHERE id=?', (new, provider_id, now, payment['id']))
            if not c.execute("SELECT 1 FROM payments WHERE order_id=? AND status IN ('pending','completed') AND id!=?", (payment['order_id'], payment['id'])).fetchone():
                sales.mark_payment(c, payment['order_id'], 'failed', f'PayU: płatność {status.lower()}')
        return new, ext
    if status in ('PENDING', 'WAITING_FOR_CONFIRMATION', 'NEW'):
        if payment['status'] == 'new':
            c.execute("UPDATE payments SET status='pending',provider_order_id=?,updated=? WHERE id=?", (provider_id, now, payment['id']))
        return 'pending', ext
    return 'ignored_status', ext


def _apply_refund_status(c, data):
    ext = str(data.get('extOrderId', ''))[:64]
    refund = data['refund']
    provider_refund = str(refund.get('refundId', ''))[:64]
    row = c.execute('SELECT r.*,p.order_id FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE r.provider_refund_id=?', (provider_refund,)).fetchone()
    if not row:
        payment = c.execute('SELECT * FROM payments WHERE ext_order_id=?', (ext,)).fetchone()
        if not payment:
            return 'unknown_refund', ext
        amount = int(refund.get('amount', 0)) if str(refund.get('amount', '')).isdigit() else 0
        if amount < 1:
            return 'invalid_refund', ext
        now = stamp()
        c.execute('INSERT INTO payment_refunds(payment_id,provider_refund_id,amount,status,reason,created,updated) VALUES(?,?,?,?,?,?,?)',
                  (payment['id'], provider_refund, amount, 'pending', str(refund.get('reasonDescription', ''))[:200], now, now))
        row = c.execute('SELECT r.*,p.order_id FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE r.provider_refund_id=?', (provider_refund,)).fetchone()
    status = str(refund.get('status', '')).upper()
    now = stamp()
    if status == 'FINALIZED':
        c.execute("UPDATE payment_refunds SET status='finalized',updated=? WHERE id=?", (now, row['id']))
        total = c.execute("SELECT COALESCE(SUM(amount),0) FROM payment_refunds WHERE payment_id=? AND status='finalized'", (row['payment_id'],)).fetchone()[0]
        paid = c.execute('SELECT amount FROM payments WHERE id=?', (row['payment_id'],)).fetchone()[0]
        sales.mark_payment(c, row['order_id'], 'refunded' if total >= paid else 'partially_refunded', f'PayU: zwrot {total / 100:.2f} PLN')
        c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)', ('payment', str(row['order_id']), f'PayU zakończył zwrot {provider_refund} ({row["amount"] / 100:.2f} PLN)', now))
        return 'refund_finalized', ext
    if status == 'CANCELED':
        c.execute("UPDATE payment_refunds SET status='canceled',updated=? WHERE id=?", (now, row['id']))
        return 'refund_canceled', ext
    c.execute("UPDATE payment_refunds SET status='pending',updated=? WHERE id=?", (now, row['id']))
    return 'refund_pending', ext


def request_refund(c, order_id, amount, reason, actor_id):
    payment = c.execute("SELECT * FROM payments WHERE order_id=? AND status='completed' ORDER BY id DESC LIMIT 1", (order_id,)).fetchone()
    if not payment:
        raise PaymentError(409, 'Brak zakończonej płatności PayU dla tego zamówienia.', 'no_completed_payment')
    if isinstance(amount, bool) or not isinstance(amount, int) or not 1 <= amount <= payment['amount']:
        raise PaymentError(400, 'Kwota zwrotu musi mieścić się w kwocie płatności.', 'invalid_amount')
    refunded = c.execute("SELECT COALESCE(SUM(amount),0) FROM payment_refunds WHERE payment_id=? AND status IN ('requested','pending','finalized')", (payment['id'],)).fetchone()[0]
    if refunded + amount > payment['amount']:
        raise PaymentError(409, 'Suma zwrotów przekroczyłaby kwotę płatności.', 'refund_exceeds_payment')
    body = {'refund': {'description': (reason or 'Zwrot Zastal Store')[:100], 'amount': amount}}
    status, payload = _call('POST', f"/api/v2_1/orders/{payment['provider_order_id']}/refunds", body, token=access_token())
    refund = payload.get('refund', {}) if isinstance(payload, dict) else {}
    code = (payload.get('status') or {}).get('statusCode') if isinstance(payload, dict) else None
    if status not in (200, 201) or code != 'SUCCESS':
        raise PaymentError(502, 'PayU nie przyjął zlecenia zwrotu.', 'provider_rejected')
    now = stamp()
    cursor = c.execute('INSERT INTO payment_refunds(payment_id,provider_refund_id,amount,status,reason,actor_id,created,updated) VALUES(?,?,?,?,?,?,?,?)',
                       (payment['id'], str(refund.get('refundId', ''))[:64], amount, 'pending', (reason or '')[:200], actor_id, now, now))
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              ('payment', str(order_id), f'Administrator {actor_id}: zlecono zwrot PayU {amount / 100:.2f} PLN', now))
    return dict(c.execute('SELECT * FROM payment_refunds WHERE id=?', (cursor.lastrowid,)).fetchone())


def order_payments(c, order_id):
    rows = [dict(row) for row in c.execute('SELECT * FROM payments WHERE order_id=? ORDER BY id', (order_id,))]
    for row in rows:
        row['refunds'] = [dict(item) for item in c.execute('SELECT * FROM payment_refunds WHERE payment_id=? ORDER BY id', (row['id'],))]
    return rows


def public_payment(c, order_id):
    """Customer-facing view: latest attempt status and whether a retry is possible."""
    rows = order_payments(c, order_id)
    latest = rows[-1] if rows else None
    return {'provider': PROVIDER, 'status': latest['status'] if latest else None,
            'redirect_url': latest['redirect_url'] if latest and latest['status'] in ('new', 'pending') else '',
            'can_retry': bool(latest) and latest['status'] in ('canceled', 'rejected', 'failed')}


def notification_event(c, payload, result):
    """Resolve a verified PayU state transition to one customer message."""
    if result in ('canceled', 'rejected'):
        ext = str(payload.get('order', {}).get('extOrderId', ''))[:64]
        row = c.execute('SELECT order_id FROM payments WHERE ext_order_id=?', (ext,)).fetchone()
        if row and (sales.details(c, row['order_id']) or {}).get('payment_status') == 'failed':
            return row['order_id'], 'payment_failed', ext
    if result in ('refund_pending', 'refund_finalized', 'refund_canceled'):
        ident = str(payload.get('refund', {}).get('refundId', ''))[:64]
        row = c.execute('SELECT r.id,p.order_id FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE r.provider_refund_id=?', (ident,)).fetchone()
        if row:
            kind = {'refund_pending': 'refund_requested', 'refund_finalized': 'refund_completed',
                    'refund_canceled': 'refund_canceled'}[result]
            return row['order_id'], kind, str(row['id'])
    return None
