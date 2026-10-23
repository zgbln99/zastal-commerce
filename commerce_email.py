"""Transactional email queue. Secrets and rendered messages never persist here.

HTTP only queues references. The independent worker generates one-use links at
send time, persists their SHA-256 digests, and sends over verified SMTP TLS.
"""
import os
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
    if tls not in ('starttls', 'ssl'):
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
    return {'configured': not missing, 'host': host, 'port': port,
            'from_address': sender, 'tls': tls, 'missing': missing}


def _credential(user):
    return auth.digest(user['password_hash'])


def _queue(c, user, kind, order_id=None, dedupe=None, recipient=None):
    now = int(time.time())
    credential = _credential(user) if kind in AUTH_KINDS else None
    key = dedupe or f'{kind}:{user["id"]}:{credential}'
    cursor = c.execute('''INSERT OR IGNORE INTO email_outbox
        (kind,user_id,order_id,recipient,credential_digest,dedupe_key,created,updated,next_attempt)
        VALUES(?,?,?,?,?,?,?,?,?)''', (kind, user['id'] if user else None, order_id, recipient, credential, key, now, now, now))
    if not cursor.rowcount and kind in AUTH_KINDS:
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


ORDER_KINDS = ('order_created', 'order_status_changed', 'order_paid')


def enqueue_order(c, order_id, kind='order_created'):
    if kind not in ORDER_KINDS:
        raise ValueError('Unsupported order email kind')
    row = c.execute('SELECT u.*,o.status AS order_status FROM order_receipts r JOIN users u ON u.id=r.customer_id JOIN orders o ON o.id=r.order_id WHERE r.order_id=?', (order_id,)).fetchone()
    key = f'{kind}:{order_id}'
    if kind == 'order_status_changed':
        status = c.execute('SELECT status FROM orders WHERE id=?', (order_id,)).fetchone()
        key += f':{status["status"] if status else ""}'
    if row and row['role'] == 'customer' and row['active']:
        return _queue(c, row, kind, order_id, key)
    try:
        guest = c.execute('SELECT customer_email FROM order_details WHERE order_id=?', (order_id,)).fetchone()
    except sqlite3.OperationalError:
        guest = None
    if guest and guest['customer_email']:
        return _queue(c, None, kind, order_id, key, recipient=guest['customer_email'])
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
        '/api/admin/email/retry': 'POST'}
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
    elif path == '/api/account/email/verification':
        user = auth.require_user(handler, 'customer')
        auth.rate(handler, 'email_verify_request', str(user['id']), count=5, window=3600)
        user = auth.begin_account_write(handler, c)
        queue_verification(c, user)
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
    recipient = user['identifier'] if user else (row['recipient'] if row['kind'] in ORDER_KINDS else None)
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
            subject = 'Zastal Store — potwierdź adres e-mail'
            body = f'Potwierdź adres e-mail swojego konta Zastal Store:\n\n{link}\n\nLink jest jednorazowy i ważny przez 24 godziny.\nJeżeli nie tworzono konta, zignoruj tę wiadomość.'
        else:
            subject = 'Zastal Store — zmiana hasła'
            body = f'Ustaw nowe hasło do konta Zastal Store:\n\n{link}\n\nLink jest jednorazowy i ważny przez godzinę.\nJeżeli nie proszono o zmianę hasła, zignoruj tę wiadomość.'
    else:
        order = c.execute('SELECT * FROM orders WHERE id=?', (row['order_id'],)).fetchone()
        if not order:
            c.commit()
            return None
        import commerce_sales as sales
        subject, body = sales.order_email(c, order, sales.details(c, order['id']), row['kind'], os.environ['ZASTAL_SITE_ORIGIN'].rstrip('/'))
    c.commit()
    message = EmailMessage()
    message['From'], message['To'], message['Subject'] = config['from_address'], recipient, subject
    message['Message-ID'] = make_msgid(idstring=f'zastal-{row["id"]}', domain=config['from_address'].split('@', 1)[1])
    message.set_content(body)
    return message


def _deliver(message, config):
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
