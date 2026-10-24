"""Real-sales configuration: shipping methods, payment methods, order details, sales mode.

Nothing here can enable live checkout on its own. Live mode requires the server
environment ZASTAL_SALES_MODE=live *and* every readiness check (seller data,
policies, confirmations, at least one enabled delivery and payment method). All
amounts are integer groszy. HTTP layer owns transactions.
"""
import datetime as dt
import json
import os
import re
import sqlite3
import unicodedata

import commerce_launch as launch
import commerce_dpd as dpd

SHIPPING_KINDS = ('pickup', 'locker', 'courier')
PAYMENT_METHODS = ('payu', 'transfer', 'pickup')
PAYMENT_STATES = ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')
ORDER_MODES = ('test', 'live')
# Public order statuses. Legacy values stay valid for historical rows.
STATUSES = ('nowe', 'oczekuje_platnosci', 'oplacone', 'potwierdzone', 'do_kompletacji', 'nanoszenie_dtf',
            'kontrola_jakosci', 'spakowane', 'wyslane', 'wyslane_demo', 'wydane', 'anulowane', 'zwrot')
STATUS_LABELS = {'nowe': 'Nowe', 'oczekuje_platnosci': 'Oczekuje na płatność', 'oplacone': 'Opłacone',
                 'potwierdzone': 'Potwierdzone', 'do_kompletacji': 'Kompletacja', 'nanoszenie_dtf': 'Nanoszenie nadruku',
                 'kontrola_jakosci': 'Kontrola jakości', 'spakowane': 'Spakowane', 'wyslane': 'Wysłane',
                 'wyslane_demo': 'Wysłane (test)', 'wydane': 'Wydane / odebrane', 'anulowane': 'Anulowane', 'zwrot': 'Zwrot'}
CLOSED = ('anulowane', 'wyslane_demo', 'wydane', 'zwrot')
SETTINGS = {
    'transfer_enabled': 'bool', 'transfer_recipient': 160, 'transfer_account': 40, 'transfer_bank': 80,
    'transfer_title_prefix': 24, 'pickup_payment_enabled': 'bool', 'payu_enabled': 'bool',
    'pickup_address': 350, 'pickup_hours': 200, 'invoice_enabled': 'bool', 'fiscal_confirmed': 'bool',
    'unpaid_hours': 'int', 'order_note': 400, 'terms_version': 40,
}
DEFAULTS = {'transfer_enabled': False, 'transfer_recipient': '', 'transfer_account': '', 'transfer_bank': '',
            'transfer_title_prefix': 'ZASTAL', 'pickup_payment_enabled': False, 'payu_enabled': False,
            'pickup_address': '', 'pickup_hours': '', 'invoice_enabled': True, 'fiscal_confirmed': False,
            'unpaid_hours': 72, 'order_note': '', 'terms_version': ''}
LEGACY_SHIPPING = (
    ('odbior', 'Odbiór osobisty', 'pickup', 0, None, 1, 0, '', '', 10),
    ('paczkomat', 'Automat paczkowy', 'locker', 1299, 25000, 0, 1, '', '', 20),
    ('kurier', 'Kurier', 'courier', 1499, 25000, 0, 1, '', '', 30),
)


class SalesError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status, self.code = status, code


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS store_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, changed_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS shipping_methods(
            id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('pickup','locker','courier')),
            price INTEGER NOT NULL CHECK(price >= 0), free_from INTEGER CHECK(free_from IS NULL OR free_from >= 0),
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
            requires_address INTEGER NOT NULL DEFAULT 1 CHECK(requires_address IN (0,1)),
            carrier TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
            sort INTEGER NOT NULL DEFAULT 100);
        CREATE TABLE IF NOT EXISTS order_details(
            order_id INTEGER PRIMARY KEY REFERENCES orders(id),
            mode TEXT NOT NULL DEFAULT 'test' CHECK(mode IN ('test','live')),
            customer_email TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL DEFAULT '',
            customer_phone TEXT NOT NULL DEFAULT '', shipping_code TEXT NOT NULL DEFAULT 'odbior',
            shipping_name TEXT NOT NULL DEFAULT '', shipping_kind TEXT NOT NULL DEFAULT 'pickup',
            address TEXT NOT NULL DEFAULT '{}', locker_code TEXT NOT NULL DEFAULT '',
            invoice TEXT NOT NULL DEFAULT '{}', consents TEXT NOT NULL DEFAULT '{}',
            payment_method TEXT NOT NULL DEFAULT 'pickup',
            payment_status TEXT NOT NULL DEFAULT 'unpaid'
                CHECK(payment_status IN ('unpaid','pending','paid','failed','refunded','partially_refunded','cancelled')),
            paid_at TEXT, paid_amount INTEGER NOT NULL DEFAULT 0, payment_note TEXT NOT NULL DEFAULT '',
            carrier TEXT NOT NULL DEFAULT '', tracking_number TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '',
            shipped_at TEXT, note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL);
    ''')
    if not c.execute('SELECT 1 FROM shipping_methods LIMIT 1').fetchone():
        c.executemany('''INSERT INTO shipping_methods(code,name,kind,price,free_from,enabled,requires_address,carrier,tracking_url,sort)
                         VALUES(?,?,?,?,?,?,?,?,?,?)''', LEGACY_SHIPPING)


# ---------------------------------------------------------------- settings
def settings(c):
    out = dict(DEFAULTS)
    for key, value in c.execute('SELECT key,value FROM store_settings'):
        if key not in SETTINGS:
            continue
        kind = SETTINGS[key]
        out[key] = value == '1' if kind == 'bool' else int(value) if kind == 'int' else value
    return out


def _clean_text(value, label, maximum, empty=True):
    if not isinstance(value, str) or len(value) > maximum or any(unicodedata.category(ch).startswith('C') and ch not in '\n' for ch in value):
        raise SalesError(400, 'Nieprawidłowe pole: ' + label)
    value = value.strip()
    if not empty and not value:
        raise SalesError(400, 'Pole jest wymagane: ' + label)
    return value


def validate_settings(data):
    if not isinstance(data, dict) or not data:
        raise SalesError(400, 'Brak ustawień do zapisania')
    out = {}
    for key, value in data.items():
        kind = SETTINGS.get(key)
        if kind is None:
            raise SalesError(400, 'Nieznane ustawienie: ' + str(key)[:40])
        if kind == 'bool':
            if not isinstance(value, bool):
                raise SalesError(400, 'Ustawienie musi być wartością logiczną: ' + key)
            out[key] = '1' if value else '0'
        elif kind == 'int':
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 24 * 30:
                raise SalesError(400, 'Liczba godzin musi mieścić się w zakresie 1–720')
            out[key] = str(value)
        else:
            clean = _clean_text(value, key, kind)
            if key == 'transfer_account' and clean and not re.fullmatch(r'(PL)?[0-9]{26}', clean.replace(' ', '')):
                raise SalesError(400, 'Numer rachunku musi mieć 26 cyfr (format NRB/IBAN PL)')
            out[key] = clean.replace(' ', '') if key == 'transfer_account' else clean
    return out


def update_settings(c, data):
    changed = []
    for key, value in validate_settings(data).items():
        c.execute('INSERT INTO store_settings(key,value,changed_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,changed_at=excluded.changed_at',
                  (key, value, stamp()))
        changed.append(key)
    return changed


# ---------------------------------------------------------------- shipping
def shipping_methods(c, enabled_only=False):
    rows = c.execute('SELECT * FROM shipping_methods' + (' WHERE enabled=1' if enabled_only else '') + ' ORDER BY sort,id').fetchall()
    return [_shipping_public(row) for row in rows]


def _shipping_public(row):
    value = dict(row)
    value['enabled'] = bool(value['enabled'])
    value['requires_address'] = bool(value['requires_address'])
    return value


def validate_shipping(data, existing=None):
    if not isinstance(data, dict):
        raise SalesError(400, 'Oczekiwano danych metody dostawy')
    values = dict(existing or {'code': '', 'name': '', 'kind': 'courier', 'price': 0, 'free_from': None, 'enabled': False,
                               'requires_address': True, 'carrier': '', 'tracking_url': '', 'note': '', 'sort': 100})
    allowed = {'code', 'name', 'kind', 'price', 'free_from', 'enabled', 'requires_address', 'carrier', 'tracking_url', 'note', 'sort'}
    if set(data) - allowed:
        raise SalesError(400, 'Nieznane pole metody dostawy')
    values.update(data)
    code = _clean_text(values['code'], 'kod', 32, empty=False).lower()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{1,31}', code):
        raise SalesError(400, 'Kod metody: małe litery, cyfry, myślnik')
    if existing and code != existing['code']:
        raise SalesError(400, 'Kod metody dostawy jest stały')
    values['code'] = code
    values['name'] = _clean_text(values['name'], 'nazwa', 80, empty=False)
    if values['kind'] not in SHIPPING_KINDS:
        raise SalesError(400, 'Rodzaj dostawy: odbiór, automat lub kurier')
    for key in ('price', 'sort'):
        if isinstance(values[key], bool) or not isinstance(values[key], int) or not 0 <= values[key] <= 10000000:
            raise SalesError(400, 'Nieprawidłowa liczba: ' + key)
    if values['free_from'] is not None and (isinstance(values['free_from'], bool) or not isinstance(values['free_from'], int) or not 0 <= values['free_from'] <= 100000000):
        raise SalesError(400, 'Nieprawidłowy próg darmowej dostawy')
    for key in ('enabled', 'requires_address'):
        if not isinstance(values[key], bool):
            raise SalesError(400, 'Nieprawidłowy przełącznik: ' + key)
    if values['kind'] == 'pickup':
        values['requires_address'] = False
    values['carrier'] = _clean_text(values['carrier'], 'przewoźnik', 80)
    values['note'] = _clean_text(values['note'], 'opis', 300)
    url = _clean_text(values['tracking_url'], 'adres śledzenia', 300)
    if url and (not url.startswith('https://') or any(ch.isspace() for ch in url)):
        raise SalesError(400, 'Adres śledzenia musi zaczynać się od https:// (użyj {tracking} jako miejsca na numer)')
    values['tracking_url'] = url
    return values


def save_shipping(c, data, method_id=None):
    existing = None
    if method_id is not None:
        row = c.execute('SELECT * FROM shipping_methods WHERE id=?', (method_id,)).fetchone()
        if not row:
            raise SalesError(404, 'Nie znaleziono metody dostawy')
        existing = _shipping_public(row)
    values = validate_shipping(data, existing)
    if existing is None:
        if c.execute('SELECT 1 FROM shipping_methods WHERE code=?', (values['code'],)).fetchone():
            raise SalesError(409, 'Metoda o tym kodzie już istnieje')
        cursor = c.execute('''INSERT INTO shipping_methods(code,name,kind,price,free_from,enabled,requires_address,carrier,tracking_url,note,sort)
                              VALUES(?,?,?,?,?,?,?,?,?,?,?)''', (values['code'], values['name'], values['kind'], values['price'], values['free_from'],
                              int(values['enabled']), int(values['requires_address']), values['carrier'], values['tracking_url'], values['note'], values['sort']))
        method_id = cursor.lastrowid
    else:
        c.execute('''UPDATE shipping_methods SET name=?,kind=?,price=?,free_from=?,enabled=?,requires_address=?,carrier=?,tracking_url=?,note=?,sort=? WHERE id=?''',
                  (values['name'], values['kind'], values['price'], values['free_from'], int(values['enabled']), int(values['requires_address']),
                   values['carrier'], values['tracking_url'], values['note'], values['sort'], method_id))
    return _shipping_public(c.execute('SELECT * FROM shipping_methods WHERE id=?', (method_id,)).fetchone())


def shipping_cost(method, subtotal):
    if method['free_from'] is not None and subtotal >= method['free_from']:
        return 0
    return method['price']


# ---------------------------------------------------------------- payments & mode
def payment_options(c, config, payu_ready):
    """Which payment methods a customer may choose right now."""
    out = []
    if config['payu_enabled'] and payu_ready:
        out.append({'id': 'payu', 'name': 'Płatność online (PayU)', 'description': 'BLIK, karta, szybki przelew'})
    if config['transfer_enabled'] and config['transfer_account'] and config['transfer_recipient']:
        out.append({'id': 'transfer', 'name': 'Przelew tradycyjny', 'description': 'Dane do przelewu po złożeniu zamówienia'})
    if config['pickup_payment_enabled']:
        out.append({'id': 'pickup', 'name': 'Płatność przy odbiorze', 'description': 'Tylko przy odbiorze osobistym', 'pickup_only': True})
    return out


def readiness(c, email_configured, payu_ready):
    config = settings(c)
    enabled_shipping = [method for method in shipping_methods(c, enabled_only=True)
                        if method['kind'] != 'pickup' or config['pickup_address']]
    payments = payment_options(c, config, payu_ready)
    launch_checks = launch.checks(launch.values(c))
    checks = {
        **{key: launch_checks[key] for key in ('seller', 'policies', 'brand', 'catalog', 'stock', 'supplier')},
        'payment': bool(payments),
        'delivery': bool(enabled_shipping),
        'email': bool(email_configured),
        'fiscal': bool(config['fiscal_confirmed']),
    }
    requested = os.environ.get('ZASTAL_SALES_MODE', 'prelaunch').strip().lower()
    blocking = [key for key, ok in checks.items() if not ok]
    live = requested == 'live' and not blocking
    return {'checks': checks, 'requested_mode': requested, 'mode': 'live' if live else 'prelaunch',
            'blocking': blocking, 'switch_present': requested == 'live'}


def public_config(c, email_configured, payu_ready, mode):
    config = settings(c)
    values = launch.values(c)
    return {
        'mode': mode,
        'checkout_enabled': mode == 'live',
        'shipping_methods': [{key: method[key] for key in ('code', 'name', 'kind', 'price', 'free_from', 'requires_address', 'carrier', 'note')}
                             for method in shipping_methods(c, enabled_only=True)],
        'payment_methods': payment_options(c, config, payu_ready),
        'pickup_address': config['pickup_address'], 'pickup_hours': config['pickup_hours'],
        'invoice_enabled': config['invoice_enabled'], 'order_note': config['order_note'],
        'legal': {key: values[key] for key in ('terms_url', 'privacy_url', 'returns_url', 'shipping_url')},
        'seller': {'name': values['seller_name'], 'support_email': values['support_email'], 'support_phone': values['support_phone'] if launch.valid_support_phone(values['support_phone']) else ''},
    }


# ---------------------------------------------------------------- checkout validation
EMAIL = re.compile(r'[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+')


def _field(data, key, label, maximum, required):
    value = data.get(key, '')
    if value is None:
        value = ''
    value = _clean_text(value, label, maximum, empty=not required)
    return value


def validate_checkout(data, methods, payments, config, live):
    """Returns normalized customer/shipping/payment/invoice/consents. Strict when live."""
    fulfillment = data.get('fulfillment') if isinstance(data.get('fulfillment'), str) else None
    shipping = data.get('shipping') if isinstance(data.get('shipping'), dict) else {}
    code = shipping.get('method') if isinstance(shipping.get('method'), str) else fulfillment or 'odbior'
    method = next((item for item in methods if item['code'] == code), None)
    if not method:
        raise SalesError(400, 'Nieprawidłowa metoda dostawy', 'invalid_shipping')
    customer = data.get('customer') if isinstance(data.get('customer'), dict) else {}
    email = _field(customer, 'email', 'e-mail', 254, live).casefold()
    if email and not EMAIL.fullmatch(email):
        raise SalesError(400, 'Podaj poprawny adres e-mail', 'invalid_customer')
    name = _field(customer, 'name', 'imię i nazwisko', 120, live)
    phone = _field(customer, 'phone', 'telefon', 30, False)
    if phone and not re.fullmatch(r'\+?[0-9 ()-]{6,30}', phone):
        raise SalesError(400, 'Podaj poprawny numer telefonu', 'invalid_customer')
    address = {}
    raw_address = shipping.get('address') if isinstance(shipping.get('address'), dict) else {}
    if method['requires_address']:
        address = {'line1': _field(raw_address, 'line1', 'ulica i numer', 160, live),
                   'line2': _field(raw_address, 'line2', 'lokal', 80, False),
                   'postal_code': _field(raw_address, 'postal_code', 'kod pocztowy', 12, live),
                   'city': _field(raw_address, 'city', 'miejscowość', 80, live),
                   'country': (_field(raw_address, 'country', 'kraj', 2, False) or 'PL').upper()}
        if address['postal_code'] and not re.fullmatch(r'[0-9]{2}-[0-9]{3}', address['postal_code']):
            raise SalesError(400, 'Kod pocztowy w formacie 00-000', 'invalid_address')
        if address['country'] != 'PL':
            raise SalesError(400, 'Wysyłamy obecnie tylko na terenie Polski', 'invalid_address')
    locker = _field(shipping, 'locker_code', 'kod automatu', 24, live and method['kind'] == 'locker')
    if locker and not re.fullmatch(r'[A-Za-z0-9-]{3,24}', locker):
        raise SalesError(400, 'Podaj kod automatu paczkowego (np. ZGO12M)', 'invalid_address')
    payment = data.get('payment') if isinstance(data.get('payment'), str) else None
    if live:
        option = next((item for item in payments if item['id'] == payment), None)
        if not option:
            raise SalesError(400, 'Wybierz dostępną metodę płatności', 'invalid_payment')
        if option.get('pickup_only') and method['kind'] != 'pickup':
            raise SalesError(400, 'Płatność przy odbiorze dotyczy tylko odbioru osobistego', 'invalid_payment')
    elif payment not in (None, *PAYMENT_METHODS):
        raise SalesError(400, 'Nieprawidłowa metoda płatności', 'invalid_payment')
    invoice_raw = data.get('invoice') if isinstance(data.get('invoice'), dict) else {}
    invoice = {}
    if invoice_raw.get('requested') is True:
        if not config['invoice_enabled']:
            raise SalesError(400, 'Faktury nie są obecnie wystawiane w sklepie', 'invalid_invoice')
        invoice = {'requested': True, 'company': _field(invoice_raw, 'company', 'nazwa firmy', 160, True),
                   'tax_id': _field(invoice_raw, 'tax_id', 'NIP', 24, True),
                   'address': _field(invoice_raw, 'address', 'adres firmy', 300, True)}
        if not launch.niptax_ok(invoice['tax_id']):
            raise SalesError(400, 'Nieprawidłowy NIP do faktury', 'invalid_invoice')
    consents_raw = data.get('consents') if isinstance(data.get('consents'), dict) else {}
    consents = {key: consents_raw.get(key) is True for key in ('terms', 'privacy', 'marketing')}
    if live and not (consents['terms'] and consents['privacy']):
        raise SalesError(400, 'Zaakceptuj regulamin i potwierdź zapoznanie się z polityką prywatności', 'consent_required')
    return {'method': method, 'customer': {'email': email, 'name': name, 'phone': phone}, 'address': address,
            'locker_code': locker.upper(), 'payment': payment or ('pickup' if method['kind'] == 'pickup' else 'transfer'),
            'invoice': invoice, 'consents': consents}


def initial_status(payment, mode):
    if mode != 'live':
        return 'nowe'
    return 'potwierdzone' if payment == 'pickup' else 'oczekuje_platnosci'


def save_details(c, order_id, checkout, mode):
    now = stamp()
    method = checkout['method']
    c.execute('''INSERT INTO order_details(order_id,mode,customer_email,customer_name,customer_phone,shipping_code,shipping_name,
                 shipping_kind,address,locker_code,invoice,consents,payment_method,payment_status,created,updated)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
              (order_id, mode, checkout['customer']['email'], checkout['customer']['name'], checkout['customer']['phone'],
               method['code'], method['name'], method['kind'], json.dumps(checkout['address'], ensure_ascii=False),
               checkout['locker_code'], json.dumps(checkout['invoice'], ensure_ascii=False),
               json.dumps({**checkout['consents'], 'terms_version': settings(c)['terms_version'], 'accepted_at': now}, ensure_ascii=False),
               checkout['payment'], 'unpaid', now, now))


def details(c, order_id):
    try:
        row = c.execute('SELECT * FROM order_details WHERE order_id=?', (order_id,)).fetchone()
    except sqlite3.OperationalError:
        return None
    if not row:
        return None
    value = dict(row)
    for key in ('address', 'invoice', 'consents'):
        try:
            value[key] = json.loads(value[key]) if value[key] else {}
        except ValueError:
            value[key] = {}
    value['shipment'] = dpd.public_shipment(c, order_id)
    return value


def public_details(value):
    """Customer-facing subset; never exposes internal notes."""
    if not value:
        return {'mode': 'test', 'payment_method': None, 'payment_status': 'unpaid'}
    keys = ('mode', 'customer_email', 'customer_name', 'customer_phone', 'shipping_code', 'shipping_name', 'shipping_kind',
            'address', 'locker_code', 'invoice', 'payment_method', 'payment_status', 'paid_at', 'carrier', 'tracking_number',
            'tracking_url', 'shipped_at', 'shipment')
    return {key: value.get(key) for key in keys}


def transfer_instructions(c, order_id, total):
    config = settings(c)
    if not config['transfer_account']:
        return None
    return {'recipient': config['transfer_recipient'], 'account': config['transfer_account'], 'bank': config['transfer_bank'],
            'title': f"{config['transfer_title_prefix']} ZS-{order_id:05d}", 'amount': total}


def _event(c, order_id, status):
    c.execute('UPDATE orders SET status=? WHERE id=?', (status, order_id))
    c.execute('INSERT INTO events(order_id,created,status) VALUES(?,?,?)', (order_id, stamp(), status))


def mark_paid(c, order_id, amount, source, note=''):
    """Idempotent: a paid order stays paid. Returns True when the state changed."""
    order = c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
    detail = c.execute('SELECT * FROM order_details WHERE order_id=?', (order_id,)).fetchone()
    if not order or not detail:
        raise SalesError(404, 'Nie znaleziono zamówienia', 'order_not_found')
    if detail['payment_status'] == 'paid':
        return False
    if order['status'] == 'anulowane':
        raise SalesError(409, 'Zamówienie jest anulowane — zarejestruj zwrot wpłaty', 'order_cancelled')
    now = stamp()
    c.execute('UPDATE order_details SET payment_status=?,paid_at=?,paid_amount=?,payment_note=?,updated=? WHERE order_id=?',
              ('paid', now, amount, f'{source}: {note}'[:300], now, order_id))
    if order['status'] in ('nowe', 'oczekuje_platnosci', 'potwierdzone'):
        _event(c, order_id, 'oplacone')
    return True


def mark_payment(c, order_id, state, note=''):
    if state not in PAYMENT_STATES:
        raise SalesError(400, 'Nieprawidłowy stan płatności')
    now = stamp()
    c.execute('UPDATE order_details SET payment_status=?,payment_note=?,updated=? WHERE order_id=?', (state, note[:300], now, order_id))


def record_shipment(c, order_id, data):
    order = c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
    detail = details(c, order_id)
    if not order:
        raise SalesError(404, 'Nie znaleziono zamówienia', 'order_not_found')
    if order['status'] not in ('spakowane',):
        raise SalesError(409, 'Wysyłkę można zarejestrować tylko dla spakowanego zamówienia', 'order_not_packed')
    if detail and detail['mode'] == 'live' and detail['payment_status'] != 'paid' and detail['payment_method'] != 'pickup':
        raise SalesError(409, 'Zamówienie nie jest opłacone', 'order_unpaid')
    if not isinstance(data, dict):
        raise SalesError(400, 'Oczekiwano danych przesyłki')
    carrier = _clean_text(data.get('carrier', ''), 'przewoźnik', 80, empty=False)
    number = _clean_text(data.get('tracking_number', ''), 'numer przesyłki', 64, empty=False)
    if not re.fullmatch(r'[A-Za-z0-9 _/-]{4,64}', number):
        raise SalesError(400, 'Numer przesyłki: 4–64 znaki (litery, cyfry, myślnik)')
    url = ''
    method = c.execute('SELECT tracking_url FROM shipping_methods WHERE code=?', (detail['shipping_code'] if detail else '',)).fetchone()
    template = data.get('tracking_url') if isinstance(data.get('tracking_url'), str) and data.get('tracking_url') else (method['tracking_url'] if method else '')
    if template:
        template = _clean_text(template, 'adres śledzenia', 300)
        if not template.startswith('https://'):
            raise SalesError(400, 'Adres śledzenia musi używać HTTPS')
        url = template.replace('{tracking}', number.replace(' ', ''))
    if carrier.casefold().startswith('dpd'):
        carrier = 'DPD'
        number = number.replace(' ', '').upper()
        if not dpd.valid_waybill(number):
            raise SalesError(400, 'Podaj poprawny numer przesyłki DPD (14 znaków)', 'invalid_dpd_waybill')
        url = dpd.tracking_url(number)
    now = stamp()
    if detail:
        c.execute('UPDATE order_details SET carrier=?,tracking_number=?,tracking_url=?,shipped_at=?,updated=? WHERE order_id=?',
                  (carrier, number, url, now, now, order_id))
    else:
        c.execute('''INSERT INTO order_details(order_id,mode,carrier,tracking_number,tracking_url,shipped_at,created,updated)
                     VALUES(?,?,?,?,?,?,?,?)''', (order_id, 'test', carrier, number, url, now, now, now))
    _event(c, order_id, 'wyslane')
    return details(c, order_id)


def expire_unpaid(c, hours=None):
    """Cancels live orders awaiting online/transfer payment past the deadline and restores stock."""
    config = settings(c)
    limit = hours or config['unpaid_hours']
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=limit)).isoformat(timespec='seconds')
    rows = c.execute('''SELECT o.id,o.items FROM orders o JOIN order_details d ON d.order_id=o.id
                        WHERE o.status='oczekuje_platnosci' AND d.payment_status IN ('unpaid','pending','failed') AND d.mode='live' AND o.created<?''', (cutoff,)).fetchall()
    cancelled = []
    for row in rows:
        if c.execute('SELECT 1 FROM production_tasks WHERE order_id=?', (row['id'],)).fetchone():
            continue
        restore_stock(c, row['id'], row['items'], 'zwrot rezerwacji – nieopłacone zamówienie')
        _event(c, row['id'], 'anulowane')
        c.execute('UPDATE order_details SET payment_status=?,updated=? WHERE order_id=?', ('cancelled', stamp(), row['id']))
        c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)', ('order', str(row['id']), f'Anulowano automatycznie: brak płatności przez {limit} h', stamp()))
        cancelled.append(row['id'])
    return cancelled


def restore_stock(c, order_id, items_json, reason):
    for line in json.loads(items_json):
        sku = line.get('variant_sku') or line.get('sku', '') + '-' + (line.get('size') or 'UNI')
        variant = c.execute('SELECT * FROM product_variants WHERE sku=?', (sku,)).fetchone()
        if variant:
            qty = int(line.get('qty', 1))
            c.execute('UPDATE product_variants SET stock=stock+? WHERE id=?', (qty, variant['id']))
            c.execute('UPDATE products SET stock=stock+? WHERE id=?', (qty, variant['product_id']))
            c.execute('INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)', (variant['id'], qty, reason, stamp(), 'orders'))


# ---------------------------------------------------------------- customer email content
def _safe(call, fallback):
    try:
        return call()
    except sqlite3.Error:
        return fallback


def order_email(c, order, detail, kind, origin):
    number = f'ZS-{order["id"]:05d}'
    config = _safe(lambda: settings(c), dict(DEFAULTS))
    live = bool(detail) and detail['mode'] == 'live'
    status = STATUS_LABELS.get(order['status'], order['status'])
    amount = f'{order["total"] / 100:.2f} PLN'
    link = f'{origin}/zamowienie?id={order["id"]}'
    lines = []
    if not live:
        subject = f'Zastal Store — zamówienie testowe #{order["id"]}'
        lines += [f'Zamówienie testowe #{order["id"]}', f'Status: {status}', f'Kwota testowa: {amount}', '',
                  'To sprzedaż demonstracyjna. Dokument niefiskalny: nie jest paragonem ani fakturą i nie potwierdza rzeczywistej płatności.']
    elif kind == 'order_created':
        subject = f'Zastal Store — potwierdzenie zamówienia {number}'
        lines += [f'Dziękujemy za zamówienie {number}.', f'Status: {status}', f'Do zapłaty: {amount}', '']
        if detail['payment_method'] == 'transfer':
            info = transfer_instructions(c, order['id'], order['total'])
            if info:
                lines += ['Dane do przelewu:', f'  Odbiorca: {info["recipient"]}', f'  Numer rachunku: {info["account"]}',
                          f'  Tytuł: {info["title"]}', f'  Kwota: {amount}', '',
                          f'Zamówienie czeka na wpłatę przez {config["unpaid_hours"]} godzin; potem zostanie anulowane.', '']
        elif detail['payment_method'] == 'pickup':
            lines += ['Płatność przy odbiorze osobistym.', '']
        elif detail['payment_status'] != 'paid':
            lines += ['Jeśli płatność online nie została ukończona, wróć do zamówienia i dokończ ją.', '']
    elif kind == 'order_paid':
        subject = f'Zastal Store — płatność za {number} przyjęta'
        lines += [f'Otrzymaliśmy płatność za zamówienie {number} ({amount}).', 'Przekazujemy je do realizacji.', '']
    elif order['status'] == 'wyslane':
        subject = f'Zastal Store — zamówienie {number} wysłane'
        lines += [f'Zamówienie {number} zostało nadane.']
        if detail['tracking_number']:
            lines.append(f'Przewoźnik: {detail["carrier"]} · numer przesyłki: {detail["tracking_number"]}')
        if detail['tracking_url']:
            lines.append(f'Śledzenie: {detail["tracking_url"]}')
        lines.append('')
    elif kind == 'return_update':
        subject = f'Zastal Store — zgłoszenie do zamówienia {number}'
        latest = _safe(lambda: c.execute('SELECT kind,status,refund_amount,refund_method,note FROM returns WHERE order_id=? ORDER BY id DESC LIMIT 1', (order['id'],)).fetchone(), None)
        labels = {'zgloszony': 'przyjęliśmy zgłoszenie i sprawdzamy je', 'przyjety': 'zgłoszenie zostało zaakceptowane; odeślij produkt na adres zwrotów lub przynieś do sklepu',
                  'odrzucony': 'zgłoszenie zostało odrzucone', 'rozliczony': 'zgłoszenie zostało rozliczone'}
        if latest:
            lines += [f'{"Reklamacja" if latest["kind"] == "reklamacja" else "Zwrot"} do zamówienia {number}: {labels.get(latest["status"], latest["status"])}.']
            if latest['status'] == 'rozliczony' and latest['refund_amount']:
                lines.append(f'Zwrot środków: {latest["refund_amount"] / 100:.2f} PLN ({ {"payu": "PayU", "cash": "gotówka", "terminal": "terminal", "transfer": "przelew"}.get(latest["refund_method"], latest["refund_method"]) }).')
            if latest['note']:
                lines.append(f'Informacja od sklepu: {latest["note"]}')
        seller_info = _safe(lambda: launch.values(c), {})
        if seller_info.get('returns_address'):
            lines.append(f'Adres do zwrotów: {seller_info["returns_address"]}')
        lines.append('')
    elif order['status'] == 'anulowane':
        subject = f'Zastal Store — zamówienie {number} anulowane'
        lines += [f'Zamówienie {number} zostało anulowane.', 'Jeśli dokonano wpłaty, zwrot nastąpi tą samą metodą płatności.', '']
    else:
        subject = f'Zastal Store — zamówienie {number}: {status}'
        lines += [f'Status zamówienia {number}: {status}', '']
    raw_items = order['items'] if 'items' in order.keys() else '[]'
    items = json.loads(raw_items) if isinstance(raw_items, str) else raw_items or []
    lines.append('Pozycje:')
    for item in items:
        print_label = ''
        if item.get('personalization'):
            print_label = f' · nadruk {item["personalization"].get("name", "")} {item["personalization"].get("number", "")}'
        lines.append(f'  {item.get("qty", 1)} × {item.get("name", item.get("sku"))} / {item.get("size", "UNI")}{print_label} — {item.get("unit_price", 0) * item.get("qty", 1) / 100:.2f} PLN')
    if detail:
        lines += ['', f'Dostawa: {detail["shipping_name"] or detail["shipping_code"]}']
    lines += ['', f'Szczegóły zamówienia: {link}']
    seller = _safe(lambda: launch.values(c), {'seller_name': ''})
    if live and seller['seller_name']:
        lines += ['', f'Sprzedawca: {seller["seller_name"]}, {seller["business_address"]}', f'Kontakt: {seller["support_email"]} {seller["support_phone"]}'.rstrip()]
    return subject, '\n'.join(lines) + '\n'
