"""Transactional email queue. Secrets and rendered messages never persist here.

HTTP only queues references. The independent worker generates one-use links at
send time, persists their SHA-256 digests, and sends over verified SMTP TLS.
"""
import os
import html
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from email.message import EmailMessage
from email.utils import make_msgid
from urllib.parse import urlsplit
import commerce_auth as auth

MAX_ATTEMPTS = 6
LEASE_SECONDS = 300
AUTH_KINDS = ('email_verification', 'password_reset')
TOKEN_TTL = {'email_verification': 86400, 'password_reset': 3600}
STATES = ('pending', 'sending', 'retry', 'sent', 'failed', 'cancelled')


def init_schema(c):
    if 'email_verified' not in {row['name'] for row in c.execute('PRAGMA table_info(users)')}:
        c.execute('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0')
    c.executescript("""
        CREATE TABLE IF NOT EXISTS email_tokens (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('email_verification','password_reset')),
            credential_digest TEXT NOT NULL, created INTEGER NOT NULL,
            expires INTEGER NOT NULL, consumed INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens(user_id,kind);
        CREATE TABLE IF NOT EXISTS email_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
            user_id INTEGER NOT NULL, order_id INTEGER,
            credential_digest TEXT, dedupe_key TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','sending','retry','sent','failed','cancelled')),
            attempts INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
            updated INTEGER NOT NULL, next_attempt INTEGER NOT NULL,
            lease_token TEXT, lease_until INTEGER, sent INTEGER, last_error TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox(status,next_attempt);
    """)
    definition = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_outbox'").fetchone()[0]
    if 'user_id INTEGER NOT NULL' in definition:
        # Guest orders need recipients without an account; rebuild once keeping every row.
        c.executescript("""
            PRAGMA foreign_keys=OFF;
            BEGIN;
            CREATE TABLE email_outbox_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
                user_id INTEGER, order_id INTEGER, recipient TEXT,
                credential_digest TEXT, dedupe_key TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','sending','retry','sent','failed','cancelled')),
                attempts INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
                updated INTEGER NOT NULL, next_attempt INTEGER NOT NULL,
                lease_token TEXT, lease_until INTEGER, sent INTEGER, last_error TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
            INSERT INTO email_outbox_v2(id,kind,user_id,order_id,credential_digest,dedupe_key,status,attempts,created,updated,next_attempt,lease_token,lease_until,sent,last_error)
                SELECT id,kind,user_id,order_id,credential_digest,dedupe_key,status,attempts,created,updated,next_attempt,lease_token,lease_until,sent,last_error FROM email_outbox;
            DROP TABLE email_outbox;
            ALTER TABLE email_outbox_v2 RENAME TO email_outbox;
            CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox(status,next_attempt);
            COMMIT;
            PRAGMA foreign_keys=ON;
        """)


def configuration():
    host = os.environ.get('ZASTAL_SMTP_HOST', '').strip()
    sender = os.environ.get('ZASTAL_SMTP_FROM', '').strip()
    tls = os.environ.get('ZASTAL_SMTP_TLS', 'starttls').strip().lower()
    missing = []
    if not host or any(ch.isspace() or ord(ch) < 32 for ch in host) or '://' in host or '@' in host or '/' in host:
        missing.append('ZASTAL_SMTP_HOST')
        host = ''
    try:
        port = int(os.environ.get('ZASTAL_SMTP_PORT', '465' if tls == 'ssl' else '587'))
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        port = None
        missing.append('ZASTAL_SMTP_PORT')
    if not re.fullmatch(r'[^\s@<>]{1,64}@[^\s@<>]+\.[^\s@<>]+', sender):
        missing.append('ZASTAL_SMTP_FROM')
        sender = ''
    if tls not in ('starttls', 'ssl') and not (tls == 'none' and host in ('127.0.0.1', 'localhost')):
        missing.append('ZASTAL_SMTP_TLS')
    username, password = os.environ.get('ZASTAL_SMTP_USERNAME', ''), os.environ.get('ZASTAL_SMTP_PASSWORD', '')
    if bool(username) != bool(password):
        missing.append('ZASTAL_SMTP_PASSWORD' if username else 'ZASTAL_SMTP_USERNAME')
    origin = os.environ.get('ZASTAL_SITE_ORIGIN', '').strip()
    try:
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment or any(ch.isspace() for ch in origin):
            raise ValueError()
        parsed.port
    except ValueError:
        missing.append('ZASTAL_SITE_ORIGIN')
    return {'configured': not missing, 'capture': tls == 'none' and host in ('127.0.0.1', 'localhost'), 'host': host, 'port': port,
            'from_address': sender, 'tls': tls, 'missing': missing}


def _credential(user):
    return auth.digest(user['password_hash'])


def _queue(c, user, kind, order_id=None, dedupe=None, recipient=None, resend=False):
    now = int(time.time())
    credential = _credential(user) if kind in AUTH_KINDS else None
    key = dedupe or f'{kind}:{user["id"]}:{credential}'
    cursor = c.execute('''INSERT OR IGNORE INTO email_outbox
        (kind,user_id,order_id,recipient,credential_digest,dedupe_key,created,updated,next_attempt)
        VALUES(?,?,?,?,?,?,?,?,?)''', (kind, user['id'] if user else None, order_id, recipient, credential, key, now, now, now))
    if not cursor.rowcount and (kind in AUTH_KINDS or resend):
        # Explicit resends can revive completed requests, but never steal a live lease.
        c.execute("""UPDATE email_outbox SET status='pending',attempts=0,updated=?,next_attempt=?,
            last_error=NULL,lease_token=NULL,lease_until=NULL,sent=NULL
            WHERE dedupe_key=? AND status IN ('sent','failed','cancelled')""", (now, now, key))
    return cursor.lastrowid if cursor.rowcount else c.execute('SELECT id FROM email_outbox WHERE dedupe_key=?', (key,)).fetchone()['id']


def queue_verification(c, user):
    if user['role'] == 'customer' and user['active'] and not user['email_verified']:
        return _queue(c, user, 'email_verification')
    return None


def invalidate_tokens(c, user_id):
    now = int(time.time())
    c.execute('UPDATE email_tokens SET consumed=? WHERE user_id=? AND consumed IS NULL', (now, user_id))
    c.execute("""UPDATE email_outbox SET status='cancelled',updated=?,lease_token=NULL,lease_until=NULL
        WHERE user_id=? AND kind IN ('email_verification','password_reset') AND status IN ('pending','retry','sending','failed')""", (now, user_id))


def _issue_token(c, user, kind):
    if kind not in AUTH_KINDS or user['role'] != 'customer' or not user['active']:
        raise auth.AuthError(400, 'Link jest nieprawidłowy lub wygasł.', 'email_token_invalid')
    now = int(time.time())
    c.execute('UPDATE email_tokens SET consumed=? WHERE user_id=? AND kind=? AND consumed IS NULL', (now, user['id'], kind))
    raw = secrets.token_urlsafe(32)
    c.execute('INSERT INTO email_tokens VALUES(?,?,?,?,?,?,NULL)',
              (auth.digest(raw), user['id'], kind, _credential(user), now, now + TOKEN_TTL[kind]))
    return raw


def _consume_token(c, raw, kind):
    if not isinstance(raw, str) or not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', raw):
        raise auth.AuthError(400, 'Link jest nieprawidłowy lub wygasł.', 'email_token_invalid')
    now = int(time.time())
    token = c.execute('SELECT * FROM email_tokens WHERE token_hash=? AND kind=? AND consumed IS NULL AND expires>?', (auth.digest(raw), kind, now)).fetchone()
    user = c.execute("SELECT * FROM users WHERE id=? AND active=1 AND role='customer'", (token['user_id'],)).fetchone() if token else None
    if not user or not secrets.compare_digest(token['credential_digest'], _credential(user)):
        raise auth.AuthError(400, 'Link jest nieprawidłowy lub wygasł.', 'email_token_invalid')
    cursor = c.execute('UPDATE email_tokens SET consumed=? WHERE token_hash=? AND consumed IS NULL AND expires>?', (now, token['token_hash'], now))
    if cursor.rowcount != 1:
        raise auth.AuthError(400, 'Link jest nieprawidłowy lub wygasł.', 'email_token_invalid')
    return user


ORDER_KINDS = ('order_created', 'order_status_changed', 'order_paid', 'return_update', 'payment_failed', 'refund_requested', 'refund_completed', 'refund_canceled')
GUEST_KINDS = ('stock_alert', 'gift_card_issued', 'staff_digest', 'test_email', 'promo_code')
# Intermediate workflow steps are not customer events; packing is news only for pickup orders.
QUIET_STATUSES = ('potwierdzone', 'do_kompletacji', 'nanoszenie_dtf', 'kontrola_jakosci')


def enqueue_guest(c, kind, recipient, dedupe):
    """One-off message to an address without an account or order (e.g. back-in-stock alert)."""
    if kind not in GUEST_KINDS:
        raise ValueError('Nieznany rodzaj wiadomości')
    return _queue(c, None, kind, None, dedupe, recipient)


def enqueue_order(c, order_id, kind='order_created', suffix='', resend=False):
    if kind not in ORDER_KINDS:
        raise ValueError('Unsupported order email kind')
    row = c.execute('SELECT u.*,o.status AS order_status FROM order_receipts r JOIN users u ON u.id=r.customer_id JOIN orders o ON o.id=r.order_id WHERE r.order_id=?', (order_id,)).fetchone()
    key = f'{kind}:{order_id}' + (f':{suffix}' if suffix else '')
    if kind == 'order_status_changed':
        status = c.execute('SELECT status FROM orders WHERE id=?', (order_id,)).fetchone()
        current = status['status'] if status else ''
        if current in QUIET_STATUSES:
            return None
        if current == 'spakowane':
            try:
                kind_row = c.execute('SELECT shipping_kind FROM order_details WHERE order_id=?', (order_id,)).fetchone()
            except sqlite3.OperationalError:
                kind_row = None
            if not kind_row or kind_row['shipping_kind'] != 'pickup':
                return None
        key += f':{current}'
    if row and row['role'] == 'customer' and row['active']:
        return _queue(c, row, kind, order_id, key, resend=resend)
    try:
        guest = c.execute('SELECT customer_email FROM order_details WHERE order_id=?', (order_id,)).fetchone()
    except sqlite3.OperationalError:
        guest = None
    if guest and guest['customer_email']:
        return _queue(c, None, kind, order_id, key, recipient=guest['customer_email'], resend=resend)
    return None


def _masked(identifier):
    local, separator, domain = identifier.partition('@')
    return (local[:1] + '***@' + domain) if separator else '***'


def admin_status(c):
    counts = {state: 0 for state in STATES}
    counts.update({row['status']: row['quantity'] for row in c.execute('SELECT status,COUNT(*) AS quantity FROM email_outbox GROUP BY status')})
    rows = c.execute('''SELECT e.id,e.kind,e.order_id,e.status,e.attempts,e.created,e.updated,
        e.next_attempt,e.sent,e.last_error,COALESCE(u.identifier,e.recipient,'') AS identifier FROM email_outbox e
        LEFT JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 100''').fetchall()
    messages = []
    for row in rows:
        message = {key: row[key] for key in ('id', 'kind', 'order_id', 'status', 'attempts', 'created', 'updated', 'next_attempt', 'sent')}
        message['recipient'] = _masked(row['identifier'])
        message['last_error'] = row['last_error'] if row['last_error'] in ('smtp_delivery_failed', 'worker_interrupted', 'message_unavailable') else None
        messages.append(message)
    return {'configuration': configuration(), 'counts': counts, 'messages': messages}


def dispatch(handler, path, c):
    paths = {
        '/api/auth/email/status': 'GET', '/api/admin/email': 'GET',
        '/api/auth/password-reset/request': 'POST', '/api/auth/password-reset/confirm': 'POST',
        '/api/auth/email/verify': 'POST', '/api/account/email/verification': 'POST',
        '/api/admin/email/retry': 'POST', '/api/admin/email/test': 'POST', '/api/admin/email/promo': 'POST'}
    if path not in paths:
        return False
    if path.startswith('/api/admin/'):
        auth.require_staff(handler, 'email')
    if path.startswith('/api/account/'):
        auth.require_user(handler, 'customer')
    if handler.command != paths[path]:
        raise auth.AuthError(405, 'Niedozwolona metoda.')
    if handler.command == 'GET':
        handler.respond(200, admin_status(c) if path == '/api/admin/email' else {'configured': configuration()['configured']})
        return True
    auth.require_csrf(handler)
    data = handler.body()
    if path == '/api/auth/password-reset/request':
        identifier = auth.identifier_value(data.get('email'), email=True)
        auth.rate(handler, 'email_reset_request', identifier, count=5, window=3600)
        c.execute('BEGIN IMMEDIATE')
        user = c.execute("SELECT * FROM users WHERE identifier=? AND role='customer' AND active=1", (identifier,)).fetchone()
        if user:
            _queue(c, user, 'password_reset')
    elif path == '/api/auth/password-reset/confirm':
        auth.rate(handler, 'email_reset_confirm', count=10)
        password = auth.password_value(data)
        encoded = auth.hash_password(password)
        c.execute('BEGIN IMMEDIATE')
        user = _consume_token(c, data.get('token'), 'password_reset')
        c.execute("UPDATE users SET password_hash=?,recovery_hash=NULL,updated=datetime('now') WHERE id=?", (encoded, user['id']))
        invalidate_tokens(c, user['id'])
        c.execute('DELETE FROM auth_sessions WHERE user_id=?', (user['id'],))
        # A reset is not a login. Also revoke an authenticated requesting session.
        if getattr(handler, 'request_user', None) and handler.request_user['id'] == user['id']:
            auth.rotate(handler, c, None)
    elif path == '/api/auth/email/verify':
        auth.rate(handler, 'email_verify', count=20)
        c.execute('BEGIN IMMEDIATE')
        user = _consume_token(c, data.get('token'), 'email_verification')
        c.execute("UPDATE users SET email_verified=1,updated=datetime('now') WHERE id=?", (user['id'],))
        c.execute("UPDATE email_tokens SET consumed=? WHERE user_id=? AND kind='email_verification' AND consumed IS NULL", (int(time.time()), user['id']))
        c.execute("UPDATE email_outbox SET status='cancelled',updated=? WHERE user_id=? AND kind='email_verification' AND status IN ('pending','retry','sending','failed')", (int(time.time()), user['id']))
        _queue(c, user, 'welcome', dedupe=f'welcome:{user["id"]}')
    elif path == '/api/account/email/verification':
        user = auth.require_user(handler, 'customer')
        auth.rate(handler, 'email_verify_request', str(user['id']), count=5, window=3600)
        user = auth.begin_account_write(handler, c)
        queue_verification(c, user)
    elif path == '/api/admin/email/promo':
        import commerce_merch as merch
        auth.require_staff(handler, 'settings')
        recipient = auth.identifier_value(data.get('recipient'), email=True)
        auth.rate(handler, 'email_promo_send', recipient, count=10, window=3600)
        promo_id = data.get('promo_id')
        if type(promo_id) is not int or promo_id < 1:
            raise auth.AuthError(400, 'Wybierz kod rabatowy.')
        c.execute('BEGIN IMMEDIATE')
        promo = c.execute('SELECT * FROM promo_codes WHERE id=?', (promo_id,)).fetchone()
        if not promo:
            raise auth.AuthError(404, 'Nie znaleziono kodu rabatowego.')
        try:
            merch.find_code(c, promo['code'], promo['min_subtotal'])
        except merch.MerchError:
            raise auth.AuthError(400, 'Kod nie jest obecnie aktywny.')
        identifier = enqueue_guest(c, 'promo_code', recipient,
                                   f'promo_code:{promo_id}:{secrets.token_urlsafe(12)}')
        c.commit()
        handler.respond(200, {'ok': True, 'id': identifier})
        return True
    elif path == '/api/admin/email/test':
        auth.rate(handler, 'email_admin_test', count=5, window=3600)
        recipient = auth.identifier_value(data.get('recipient'), email=True)
        c.execute('BEGIN IMMEDIATE')
        message_id = enqueue_guest(c, 'test_email', recipient, 'test_email:' + secrets.token_urlsafe(16))
        c.commit()
        handler.respond(200, {'ok': True, 'id': message_id})
        return True
    else:
        auth.rate(handler, 'email_admin_retry', count=30, window=3600)
        identifier = data.get('id')
        if type(identifier) is not int or identifier < 1:
            raise auth.AuthError(400, 'Podaj poprawny identyfikator wiadomości.')
        c.execute('BEGIN IMMEDIATE')
        row = c.execute('SELECT * FROM email_outbox WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise auth.AuthError(404, 'Nie znaleziono wiadomości.')
        if row['status'] not in ('retry', 'failed'):
            raise auth.AuthError(409, 'Wiadomość nie oczekuje na ponowną próbę.')
        c.execute("UPDATE email_outbox SET status='pending',attempts=0,next_attempt=?,updated=?,lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=?", (int(time.time()), int(time.time()), identifier))
    c.commit()
    handler.respond(200, {'ok': True})
    return True


def _claim(c):
    now = int(time.time())
    c.execute('BEGIN IMMEDIATE')
    c.execute("UPDATE email_outbox SET status='failed',last_error='worker_interrupted',lease_token=NULL,lease_until=NULL,updated=? WHERE status='sending' AND lease_until<=? AND attempts>=?", (now, now, MAX_ATTEMPTS))
    row = c.execute("""SELECT * FROM email_outbox WHERE attempts<? AND
        ((status IN ('pending','retry') AND next_attempt<=?) OR (status='sending' AND lease_until<=?))
        ORDER BY id LIMIT 1""", (MAX_ATTEMPTS, now, now)).fetchone()
    if not row:
        c.commit()
        return None
    lease = secrets.token_urlsafe(24)
    c.execute("UPDATE email_outbox SET status='sending',attempts=attempts+1,lease_token=?,lease_until=?,updated=? WHERE id=?", (lease, now + LEASE_SECONDS, now, row['id']))
    result = c.execute('SELECT * FROM email_outbox WHERE id=?', (row['id'],)).fetchone()
    c.commit()
    return result


def _message(c, row, config):
    c.execute('BEGIN IMMEDIATE')
    current = c.execute("SELECT 1 FROM email_outbox WHERE id=? AND status='sending' AND lease_token=?", (row['id'], row['lease_token'])).fetchone()
    user = c.execute("SELECT * FROM users WHERE id=? AND active=1 AND role='customer'", (row['user_id'],)).fetchone() if row['user_id'] else None
    recipient = user['identifier'] if user else (row['recipient'] if row['kind'] in ORDER_KINDS + GUEST_KINDS else None)
    if not current or not recipient:
        c.commit()
        return None
    if row['kind'] in AUTH_KINDS:
        if row['credential_digest'] != _credential(user) or (row['kind'] == 'email_verification' and user['email_verified']):
            c.commit()
            return None
        raw = _issue_token(c, user, row['kind'])
        action = 'verify' if row['kind'] == 'email_verification' else 'reset'
        link = os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/') + '/konto/email?action=' + action + '#token=' + raw
        if action == 'verify':
            subject = 'Zastal Store, potwierdź adres e-mail'
            body = f'Potwierdź adres e-mail, aby korzystać z konta Zastal Store. W koncie sprawdzisz zamówienia i dostawę.\n\n{link}\n\nLink jest jednorazowy i ważny przez 24 godziny.\nJeżeli nie zakładano konta, zignoruj tę wiadomość.'
        else:
            subject = 'Zastal Store, zmiana hasła'
            body = f'Otrzymaliśmy prośbę o zmianę hasła do konta Zastal Store. Nowe hasło ustawisz tutaj:\n\n{link}\n\nLink jest jednorazowy i ważny przez godzinę. Po zmianie hasła wylogujemy pozostałe sesje.\nJeżeli nie proszono o zmianę hasła, zignoruj tę wiadomość.'
    elif row['kind'] == 'welcome':
        subject = 'Zastal Store, konto jest gotowe'
        body = ('Adres e-mail został potwierdzony. Możesz już korzystać z konta w Zastal Store.\n\n'
                + os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/') + '/konto\n\n'
                'W koncie sprawdzisz zamówienia i status dostawy.')
    elif row['kind'] == 'test_email':
        subject = 'Zastal Store, test poczty'
        body = 'To wiadomość testowa ze sklepu Zastal.\n\nJej status w panelu Poczta sklepu pokaże, czy serwer SMTP przyjął wiadomość.'
    elif row['kind'] == 'staff_digest':
        import commerce_digest as digest
        subject, body = digest.message(c, row['dedupe_key'].rsplit(':', 1)[1], os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/'))
    elif row['kind'] == 'gift_card_issued':
        import commerce_giftcards as giftcards
        composed = giftcards.card_message(c, int(row['dedupe_key'].rsplit(':', 1)[1]), os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/'))
        if not composed:
            c.commit()
            return None
        subject, body = composed
    elif row['kind'] == 'promo_code':
        import commerce_merch as merch
        promo_id = int(row['dedupe_key'].split(':')[1])
        promo = c.execute('SELECT * FROM promo_codes WHERE id=?', (promo_id,)).fetchone()
        if not promo:
            c.commit()
            return None
        try:
            merch.find_code(c, promo['code'], promo['min_subtotal'])
        except merch.MerchError:
            c.commit()
            return None
        subject, body = promo_message(promo, os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/'))
    elif row['kind'] == 'stock_alert':
        import commerce_merch as merch
        composed = merch.alert_message(c, int(row['dedupe_key'].rsplit(':', 1)[1]), os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/'))
        if not composed:
            c.commit()
            return None
        subject, body = composed
    else:
        order = c.execute('SELECT * FROM orders WHERE id=?', (row['order_id'],)).fetchone()
        if not order:
            c.commit()
            return None
        import commerce_sales as sales
        detail = sales.details(c, order['id'])
        if row['kind'] == 'payment_failed' and detail['payment_status'] != 'failed':
            c.commit()
            return None
        suffix = row['dedupe_key'].split(':', 2)[-1] if row['kind'].startswith('refund_') else ''
        event_id = int(suffix) if suffix.isdigit() else None
        event_amount = int(suffix.split('-')[1]) if suffix.startswith('manual-') else None
        subject, body = sales.order_email(c, order, detail, row['kind'], os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/'), event_id=event_id, event_amount=event_amount)
    c.commit()
    message = EmailMessage()
    message['From'], message['To'], message['Subject'] = config['from_address'], recipient, subject
    message['Message-ID'] = make_msgid(idstring=f'zastal-{row["id"]}', domain=config['from_address'].split('@', 1)[1])
    message.set_content(body)
    message.add_alternative(render_html(subject, body, os.environ['ZASTAL_SITE_ORIGIN'], kind=row['kind']), subtype='html')
    return message


def promo_message(promo, origin):
    amount = f'{promo["value"]}%' if promo['kind'] == 'percent' else f'{promo["value"] / 100:.2f} PLN'
    lines = [f'Kod rabatowy: {promo["code"]}', f'Rabat: {amount}']
    if promo['min_subtotal']:
        lines.append(f'Wartość produktów od: {promo["min_subtotal"] / 100:.2f} PLN')
    if promo['starts']:
        lines.append(f'Ważny od: {promo["starts"]}')
    if promo['ends']:
        lines.append(f'Ważny do: {promo["ends"]}')
    if promo['max_uses']:
        lines.append('Liczba użyć kodu jest ograniczona.')
    lines += ['', 'Wpisz kod w koszyku przed złożeniem zamówienia.', '',
              origin + '/sklep']
    return 'Zastal Store, kod rabatowy ' + promo['code'], '\n'.join(lines) + '\n'


def render_html(subject, body, origin, kind=None):
    """A restrained, email-client-safe layout for account and order messages."""
    clean_origin = origin.rstrip('/')
    lines = body.strip().splitlines()
    action_url = None
    content = []
    for line in lines:
        value = line.strip().removeprefix('Szczegóły zamówienia: ')
        if value.startswith(clean_origin + '/') and len(value) < 2048:
            action_url = value
        else:
            content.append(line.strip())
    while content and not content[-1]:
        content.pop()

    is_order = kind in ORDER_KINDS or 'Pozycje:' in content
    is_auth = kind in AUTH_KINDS or kind == 'welcome'
    is_promo = kind == 'promo_code'
    number = re.search(r'\bZS-\d+\b|#\d+', subject)
    reference = number.group(0) if number else ''
    heading = subject.split(', ', 1)[-1]
    heading = heading[:1].upper() + heading[1:]
    if kind == 'email_verification':
        heading = 'Potwierdź adres e-mail'
    elif kind == 'password_reset':
        heading = 'Ustaw nowe hasło'
    elif kind == 'welcome':
        heading = 'Konto jest gotowe'
    elif kind == 'order_created' and 'testowe' not in subject:
        heading = 'Zamówienie przyjęte'
    label = 'Twoje konto' if is_auth else 'Zamówienie' if is_order else 'Kod rabatowy' if is_promo else 'Zastal Store'
    action_label = ('Potwierdź adres e-mail' if kind == 'email_verification' else
                    'Ustaw nowe hasło' if kind == 'password_reset' else
                    'Przejdź do konta' if kind == 'welcome' else
                    'Zobacz produkty' if is_promo else
                    'Ponów płatność' if kind == 'payment_failed' else
                    'Sprawdź dostawę' if is_order and 'wysłane' in subject.lower() else
                    'Sprawdź zamówienie' if is_order else 'Otwórz wiadomość')

    def escaped(value):
        return html.escape(str(value), quote=True)

    def paragraph(value, muted=False):
        return ('<p style="margin:0 0 15px;color:' + ('#606b63' if muted else '#27352c') +
                ';font-size:15px;line-height:1.65">' + escaped(value) + '</p>')

    def row(label_text, value, strong=False):
        return ('<tr><td style="padding:11px 0;border-bottom:1px solid #e7ebe7;color:#657168;'
                'font-size:13px;vertical-align:top">' + escaped(label_text) +
                '</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e7ebe7;'
                'color:#1a2e21;font-size:' + ('17' if strong else '14') +
                'px;font-weight:' + ('700' if strong else '500') + ';vertical-align:top">' +
                escaped(value) + '</td></tr>')

    def prose(items):
        result = []
        group = []
        for line in items + ['']:
            if line:
                group.append(line)
            elif group:
                result.append('<p style="margin:0 0 16px;color:#27352c;font-size:15px;line-height:1.65">' +
                              '<br>'.join(escaped(part) for part in group) + '</p>')
                group = []
        return ''.join(result)

    if is_promo:
        pairs = [line.split(': ', 1) for line in content if ': ' in line]
        other = [line for line in content if line and ': ' not in line]
        body_markup = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e8eae7;margin:15px 0 24px">' + ''.join(row(*pair, strong=pair[0] == 'Kod rabatowy') for pair in pairs) + '</table>' + prose(other)
    elif is_order and 'Pozycje:' in content:
        split = content.index('Pozycje:')
        intro, rest = content[:split], content[split + 1:]
        items = []
        while rest and rest[0]:
            items.append(rest.pop(0))
        rest = [part for part in rest if part]
        lead = next((line for line in intro if line), '')
        meta = []
        notes = []
        for line in intro:
            if not line or line == lead:
                continue
            if ': ' in line and line.split(': ', 1)[0] in ('Status', 'Zapłacono', 'Do zapłaty', 'Kwota testowa', 'Data zamówienia', 'Płatność'):
                meta.append(tuple(line.split(': ', 1)))
            else:
                notes.append(line)
        body_markup = paragraph(lead) if lead else ''
        if meta:
            body_markup += '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 26px;border-top:1px solid #e7ebe7">' + ''.join(row(*pair) for pair in meta) + '</table>'
        for line in notes:
            if line.startswith('Śledzenie: https://'):
                tracking_url = line.removeprefix('Śledzenie: ').strip()
                try:
                    parts = urlsplit(tracking_url)
                except ValueError:
                    parts = None
                if parts and parts.scheme == 'https' and parts.hostname and not parts.username and not parts.password:
                    body_markup += ('<p style="margin:0 0 16px;font-size:14px;line-height:1.6">'
                                    '<a href="' + escaped(tracking_url) + '" style="color:#174e38;text-decoration:underline">'
                                    'Śledź przesyłkę</a></p>')
                    continue
            body_markup += paragraph(line, muted=True)
        if items:
            body_markup += '<h2 style="margin:32px 0 12px;color:#17231c;font-size:17px;font-weight:600;letter-spacing:-.02em">Zamówione produkty</h2>'
            body_markup += '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e7ebe7">'
            for item in items:
                matched = re.fullmatch(r'(\d+) × (.+?) / (.+), ([\d.,]+ PLN)', item)
                if matched:
                    qty, name, size, price = matched.groups()
                    body_markup += ('<tr><td style="padding:17px 0;border-bottom:1px solid #e8eae7;color:#68716a;font-size:14px;vertical-align:top;width:36px">' + escaped(qty) + ' ×</td>'
                                    '<td style="padding:17px 8px 17px 0;border-bottom:1px solid #e8eae7;vertical-align:top;line-height:1.45">'
                                    '<strong style="font-size:14px;font-weight:600;color:#17231c">' + escaped(name) + '</strong><br>'
                                    '<span style="font-size:12px;color:#68716a">Rozmiar: ' + escaped(size) + '</span></td>'
                                    '<td align="right" style="padding:17px 0;border-bottom:1px solid #e8eae7;color:#17231c;font-size:14px;white-space:nowrap;vertical-align:top">' + escaped(price) + '</td></tr>')
                else:
                    body_markup += '<tr><td colspan="3" style="padding:17px 0;border-bottom:1px solid #e8eae7;font-size:14px;color:#17231c;line-height:1.5">' + escaped(item) + '</td></tr>'
            body_markup += '</table>'
        summary = []
        extra = []
        for line in rest:
            if ': ' in line and (line.split(': ', 1)[0] in ('Dostawa', 'Adres dostawy', 'Punkt odbioru', 'Rabat', 'Karta podarunkowa', 'Razem do zapłaty', 'Kwota zwrotu', 'Planowana kwota zwrotu', 'Wartość zamówienia') or line.startswith('Rabat (')):
                summary.append(tuple(line.split(': ', 1)))
            else:
                extra.append(line)
        if summary:
            body_markup += '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 25px">' + ''.join(row(label_text, value, label_text in ('Razem do zapłaty', 'Kwota zwrotu')) for label_text, value in summary) + '</table>'
        body_markup += ''.join(paragraph(line, muted=True) for line in extra)
    else:
        body_markup = prose(content)

    if action_url:
        body_markup += ('<table role="presentation" cellspacing="0" cellpadding="0" style="margin:29px 0 13px"><tr><td bgcolor="#174e38" style="border-radius:24px">'
                        '<a href="' + escaped(action_url) + '" style="display:inline-block;padding:13px 24px;'
                        'background:#174e38;border-radius:24px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">'
                        + escaped(action_label) + '</a></td></tr></table>')
        if is_auth:
            body_markup += paragraph('Jeśli przycisk nie działa, skopiuj adres do przeglądarki:', muted=True)
            body_markup += '<p style="margin:0 0 20px;color:#345742;font-size:12px;line-height:1.5;word-break:break-all">' + escaped(action_url) + '</p>'

    return ('<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
            '<body style="margin:0;padding:0;background:#ffffff;color:#17231c;font-family:Arial,Helvetica,sans-serif">'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff"><tr><td align="center" style="padding:0 20px">'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff">'
            '<tr><td style="padding:27px 0 25px;border-bottom:1px solid #e8eae7">'
            '<img src="' + escaped(clean_origin + '/assets/zastal-logo-email.png') + '" width="115" height="34" alt="Zastal Zielona Góra" style="display:inline-block;width:115px;height:34px;vertical-align:middle;object-fit:contain">'
            '<span style="display:inline-block;margin:0 12px;color:#d7ded8;font-size:19px;font-weight:300;vertical-align:middle">│</span>'
            '<span style="font-size:12px;letter-spacing:.12em;font-weight:700;color:#17231c">STORE</span></td></tr>'
            '<tr><td style="padding:42px 0 35px"><p style="margin:0 0 12px;font-size:12px;font-weight:500;color:#68716a">'
            + escaped(label) + (' · ' + escaped(reference) if reference else '') + '</p>'
            '<h1 style="margin:0 0 24px;color:#17231c;font-size:32px;line-height:1.13;font-weight:600;letter-spacing:-.045em">'
            + escaped(heading) + '</h1>' + body_markup + '</td></tr>'
            '<tr><td style="padding:23px 0 38px;border-top:1px solid #e8eae7;color:#68716a;font-size:12px;line-height:1.8">'
            '<span style="color:#17231c;font-weight:600">Zastal Store</span> · Zielona Góra<br>'
            '<a href="mailto:office@basketzg.pl" style="color:#174e38;text-decoration:underline">office@basketzg.pl</a>'
            '</td></tr></table></td></tr></table></body></html>')


def _deliver(message, config):
    if config['capture'] and not str(message['To']).lower().endswith('@zastal.test'):
        raise smtplib.SMTPRecipientsRefused({str(message['To']): (550, 'test mailbox only')})
    context = ssl.create_default_context()
    factory = smtplib.SMTP_SSL if config['tls'] == 'ssl' else smtplib.SMTP
    kwargs = {'host': config['host'], 'port': config['port'], 'timeout': 20}
    if config['tls'] == 'ssl':
        kwargs['context'] = context
    with factory(**kwargs) as smtp:
        smtp.ehlo()
        if config['tls'] == 'starttls':
            smtp.starttls(context=context)
            smtp.ehlo()
        username = os.environ.get('ZASTAL_SMTP_USERNAME', '')
        if username:
            smtp.login(username, os.environ['ZASTAL_SMTP_PASSWORD'])
        if smtp.send_message(message):
            raise smtplib.SMTPException('Recipient refused')


def process_outbox(connect, limit=10):
    config = configuration()
    result = {'configured': config['configured'], 'sent': 0, 'failed': 0, 'cancelled': 0}
    if not config['configured']:
        return result
    limit = max(0, min(int(limit), 100))
    for _ in range(limit):
        c = connect()
        try:
            row = _claim(c)
            if row is None:
                break
            try:
                message = _message(c, row, config)
                if message is None:
                    status, reason = 'cancelled', 'message_unavailable'
                else:
                    _deliver(message, config)
                    status, reason = 'sent', None
            except Exception:
                # SMTP exceptions may embed addresses, credentials, and message data.
                c.rollback()
                status = 'failed' if row['attempts'] >= MAX_ATTEMPTS else 'retry'
                reason = 'smtp_delivery_failed'
            now = int(time.time())
            c.execute('''UPDATE email_outbox SET status=?,updated=?,next_attempt=?,sent=?,
                last_error=?,lease_token=NULL,lease_until=NULL
                WHERE id=? AND status='sending' AND lease_token=?''',
                (status, now, now + min(3600, 60 * 2 ** (row['attempts'] - 1)), now if status == 'sent' else None,
                 reason, row['id'], row['lease_token']))
            c.commit()
            result['sent' if status == 'sent' else 'cancelled' if status == 'cancelled' else 'failed'] += 1
        finally:
            c.close()
    return result
