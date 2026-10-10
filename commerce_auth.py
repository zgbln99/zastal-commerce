"""Password accounts and opaque cookie sessions, separate from commerce writes."""
import hashlib
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from http.cookies import CookieError, SimpleCookie

COOKIE = '__Host-zastal_session'
SITE_ORIGIN = os.environ.get('ZASTAL_SITE_ORIGIN', 'https://zastalstore.51-15-21-164.sslip.io').rstrip('/')
TTL = {None: 3600, 'customer': 7 * 86400, 'admin': 8 * 3600}
_limits = defaultdict(deque)
_rate_lock = threading.Lock()
_hash_slots = threading.BoundedSemaphore(2)


class AuthError(Exception):
    def __init__(self, status, message, code='account_error'):
        super().__init__(message)
        self.status, self.code = status, code


def clear_limits():
    with _rate_lock:
        _limits.clear()


def rate(handler, purpose, identifier='', count=8, window=900):
    ip = handler.headers.get('X-Real-IP') or handler.client_address[0]
    now = time.monotonic()
    keys = [(purpose, 'ip', ip, count * 6)]
    if identifier:
        keys.append((purpose, 'account', identifier.casefold(), count))
    with _rate_lock:
        if len(_limits) > 20000:
            for key in list(_limits):
                if not _limits[key] or _limits[key][-1] < now - 3600:
                    del _limits[key]
            if len(_limits) > 20000:
                raise AuthError(429, 'Zbyt wiele prób. Spróbuj za kilkanaście minut.')
        for purpose, scope, value, maximum in keys:
            queue = _limits[(purpose, scope, value)]
            while queue and queue[0] < now - window:
                queue.popleft()
            if len(queue) >= maximum:
                raise AuthError(429, 'Zbyt wiele prób. Spróbuj za kilkanaście minut.')
        for purpose, scope, value, _ in keys:
            _limits[(purpose, scope, value)].append(now)


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    if not _hash_slots.acquire(timeout=2):
        raise AuthError(429, 'Logowanie jest zajęte. Spróbuj za chwilę.')
    try:
        value = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=16384,
                               r=8, p=5, maxmem=64 * 1024 * 1024, dklen=32)
        return 'scrypt$16384$8$5$' + salt.hex() + '$' + value.hex()
    finally:
        _hash_slots.release()


def verify_password(password, encoded):
    if not encoded:
        hash_password(password, b'ZastalDummySalt!')
        return False
    try:
        algorithm, n, r, p, salt, _ = encoded.split('$')
        if (algorithm, n, r, p) != ('scrypt', '16384', '8', '5'):
            return False
        return secrets.compare_digest(hash_password(password, bytes.fromhex(salt)), encoded)
    except (ValueError, TypeError):
        return False


def password_value(data, field='password'):
    value = data.get(field)
    if not isinstance(value, str) or not 12 <= len(value) <= 128:
        raise AuthError(400, 'Hasło musi mieć od 12 do 128 znaków.')
    return value


def identifier_value(value, email=False):
    if not isinstance(value, str) or len(value) > 254:
        raise AuthError(400, 'Podaj poprawny adres e-mail.')
    value = value.strip().casefold()
    if not value or (email and not re.fullmatch(r'[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+', value)):
        raise AuthError(400, 'Podaj poprawny adres e-mail.')
    return value


def name_value(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 80 or any(ord(c) < 32 for c in value):
        raise AuthError(400, 'Podaj nazwę konta (1–80 znaków).')
    return value.strip()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def public_user(row):
    return {field: row[field] for field in ('id', 'identifier', 'name', 'role', 'created')} if row is not None else None


def init_schema(c, bootstrap_secret):
    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, identifier TEXT UNIQUE NOT NULL COLLATE NOCASE,
            name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','admin')),
            password_hash TEXT NOT NULL, recovery_hash TEXT, active INTEGER NOT NULL DEFAULT 1,
            created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER, csrf_token TEXT NOT NULL,
            created INTEGER NOT NULL, expires INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS sessions_user ON auth_sessions(user_id);
        CREATE INDEX IF NOT EXISTS sessions_expiry ON auth_sessions(expires);
    """)
    if bootstrap_secret and not c.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        c.execute("INSERT INTO users(identifier,name,role,password_hash,created,updated) VALUES('admin','Administrator','admin',?,datetime('now'),datetime('now'))",
                  (hash_password(bootstrap_secret),))


def session(handler, c, create=False):
    handler.response_headers = getattr(handler, 'response_headers', [])
    try:
        cookies = SimpleCookie(handler.headers.get('Cookie', ''))
        raw = cookies[COOKIE].value if COOKIE in cookies else ''
    except CookieError:
        raw = ''
    entry = c.execute('SELECT * FROM auth_sessions WHERE token_hash=? AND expires>?',
                      (digest(raw), int(time.time()))).fetchone() if 20 <= len(raw) <= 128 else None
    user = c.execute('SELECT * FROM users WHERE id=? AND active=1', (entry['user_id'],)).fetchone() if entry and entry['user_id'] else None
    if entry and entry['user_id'] and not user:
        entry = None
    handler.request_session, handler.request_user = entry, user
    if create and entry is None:
        rate(handler, 'session', count=30, window=3600)
        return rotate(handler, c, None)
    return entry, user


def rotate(handler, c, user, revoke_all=False):
    current = getattr(handler, 'request_session', None)
    if revoke_all and user:
        c.execute('DELETE FROM auth_sessions WHERE user_id=?', (user['id'],))
    elif current:
        c.execute('DELETE FROM auth_sessions WHERE token_hash=?', (current['token_hash'],))
    c.execute('DELETE FROM auth_sessions WHERE expires<=?', (int(time.time()),))
    raw, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    seconds = TTL[user['role'] if user else None]
    c.execute('INSERT INTO auth_sessions VALUES(?,?,?,?,?)',
              (digest(raw), user['id'] if user else None, csrf, int(time.time()), int(time.time()) + seconds))
    handler.response_headers.append(('Set-Cookie', f'{COOKIE}={raw}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age={seconds}'))
    entry = c.execute('SELECT * FROM auth_sessions WHERE token_hash=?', (digest(raw),)).fetchone()
    handler.request_session, handler.request_user = entry, user
    return entry, user


def require_user(handler, role=None):
    user = getattr(handler, 'request_user', None)
    if not user:
        raise AuthError(401, 'Zaloguj się, aby kontynuować.', 'session_required')
    if role and user['role'] != role:
        raise AuthError(403, 'To konto nie ma dostępu do tej części sklepu.', 'role_required')
    return user


def check_origin(handler):
    origin = handler.headers.get('Origin')
    if (origin and origin.rstrip('/') != SITE_ORIGIN) or handler.headers.get('Sec-Fetch-Site') == 'cross-site':
        raise AuthError(403, 'Żądanie pochodzi spoza sklepu.', 'csrf_invalid')


def require_csrf(handler):
    check_origin(handler)
    entry = getattr(handler, 'request_session', None)
    token = handler.headers.get('X-CSRF-Token', '')
    if not entry or not token.isascii() or not secrets.compare_digest(entry['csrf_token'], token):
        raise AuthError(403, 'Sesja formularza wygasła. Spróbuj ponownie.', 'csrf_invalid')


def session_response(handler):
    return {'user': public_user(handler.request_user), 'csrf_token': handler.request_session['csrf_token']}


def begin_account_write(handler, c):
    """Recheck the session under the write lock after slow password hashing."""
    verified = require_user(handler)
    c.execute('BEGIN IMMEDIATE')
    user = c.execute('SELECT * FROM users WHERE id=? AND active=1', (verified['id'],)).fetchone()
    entry = c.execute('SELECT * FROM auth_sessions WHERE token_hash=? AND user_id=? AND expires>?',
        (handler.request_session['token_hash'], verified['id'], int(time.time()))).fetchone()
    if not user or not entry or user['password_hash'] != verified['password_hash']:
        raise AuthError(401, 'Sesja konta wygasła. Zaloguj się ponownie.', 'session_required')
    handler.request_user, handler.request_session = user, entry
    return user


def dispatch(handler, path, c):
    """Returns True for a handled route; commit before sending successful replies."""
    method = handler.command
    if method == 'GET' and path == '/api/auth/session':
        session(handler, c, create=True)
        c.commit()
        handler.respond(200, session_response(handler))
        return True
    paths = ('/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/recover',
             '/api/account/profile', '/api/account/password', '/api/account/recovery-key', '/api/account/logout-others')
    if path not in paths:
        return False
    if method != ('PATCH' if path == '/api/account/profile' else 'POST'):
        raise AuthError(405, 'Niedozwolona metoda.')
    require_csrf(handler)
    data = handler.body()
    extra, status = {}, 200
    if path == '/api/auth/register':
        identifier = identifier_value(data.get('email'), email=True)
        name, password = name_value(data.get('name')), password_value(data)
        rate(handler, 'register', count=5, window=3600)
        encoded, key = hash_password(password), secrets.token_urlsafe(32)
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM users WHERE identifier=?', (identifier,)).fetchone():
            raise AuthError(409, 'Nie można utworzyć konta z tym adresem. Zaloguj się lub odzyskaj dostęp.')
        cursor = c.execute("INSERT INTO users(identifier,name,role,password_hash,recovery_hash,created,updated) VALUES(?,?,'customer',?,?,datetime('now'),datetime('now'))",
                           (identifier, name, encoded, digest(key)))
        user = c.execute('SELECT * FROM users WHERE id=?', (cursor.lastrowid,)).fetchone()
        rotate(handler, c, user)
        extra['recovery_key'], status = key, 201
    elif path == '/api/auth/login':
        identifier, password = identifier_value(data.get('identifier')), data.get('password')
        if not isinstance(password, str) or len(password) > 128:
            raise AuthError(401, 'Nieprawidłowy login lub hasło.', 'credentials_invalid')
        rate(handler, 'login', identifier)
        user = c.execute('SELECT * FROM users WHERE identifier=?', (identifier,)).fetchone()
        valid = verify_password(password, user['password_hash'] if user else None)
        if not user or not valid or not user['active']:
            raise AuthError(401, 'Nieprawidłowy login lub hasło.', 'credentials_invalid')
        verified_hash = user['password_hash']
        c.execute('BEGIN IMMEDIATE')
        user = c.execute('SELECT * FROM users WHERE id=? AND active=1', (user['id'],)).fetchone()
        if not user or user['password_hash'] != verified_hash:
            raise AuthError(401, 'Nieprawidłowy login lub hasło.', 'credentials_invalid')
        rotate(handler, c, user)
    elif path == '/api/auth/logout':
        rotate(handler, c, None)
    elif path == '/api/auth/recover':
        identifier, password = identifier_value(data.get('identifier')), password_value(data)
        rate(handler, 'recover', identifier, count=5)
        key = data.get('recovery_key')
        if not isinstance(key, str) or len(key) > 128:
            raise AuthError(400, 'Nieprawidłowy login lub klucz odzyskiwania.')
        user = c.execute('SELECT * FROM users WHERE identifier=?', (identifier,)).fetchone()
        if not user or not user['active'] or not user['recovery_hash'] or not secrets.compare_digest(digest(key), user['recovery_hash']):
            raise AuthError(400, 'Nieprawidłowy login lub klucz odzyskiwania.')
        encoded, new_key = hash_password(password), secrets.token_urlsafe(32)
        c.execute('BEGIN IMMEDIATE')
        cursor = c.execute("UPDATE users SET password_hash=?,recovery_hash=?,updated=datetime('now') WHERE id=? AND recovery_hash=? AND active=1",
                           (encoded, digest(new_key), user['id'], user['recovery_hash']))
        if cursor.rowcount != 1:
            raise AuthError(400, 'Klucz został już użyty. Użyj aktualnego klucza odzyskiwania.')
        rotate(handler, c, user, revoke_all=True)
        extra['recovery_key'] = new_key
    else:
        user = require_user(handler)
        if path == '/api/account/profile':
            user = begin_account_write(handler, c)
            c.execute("UPDATE users SET name=?,updated=datetime('now') WHERE id=?", (name_value(data.get('name')), user['id']))
            handler.request_user = c.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
        elif path == '/api/account/logout-others':
            user = begin_account_write(handler, c)
            c.execute('DELETE FROM auth_sessions WHERE user_id=? AND token_hash!=?', (user['id'], handler.request_session['token_hash']))
        else:
            current = data.get('current_password')
            if not isinstance(current, str) or len(current) > 128:
                raise AuthError(400, 'Obecne hasło jest nieprawidłowe.')
            rate(handler, 'password', str(user['id']))
            if not verify_password(current, user['password_hash']):
                raise AuthError(400, 'Obecne hasło jest nieprawidłowe.')
            if path == '/api/account/password':
                encoded = hash_password(password_value(data))
                user = begin_account_write(handler, c)
                c.execute("UPDATE users SET password_hash=?,updated=datetime('now') WHERE id=?", (encoded, user['id']))
                user = c.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
                rotate(handler, c, user, revoke_all=True)
            else:
                key = secrets.token_urlsafe(32)
                user = begin_account_write(handler, c)
                c.execute('UPDATE users SET recovery_hash=? WHERE id=?', (digest(key), user['id']))
                extra['recovery_key'] = key
    c.commit()
    handler.respond(status, {**session_response(handler), **extra, 'ok': True})
    return True
