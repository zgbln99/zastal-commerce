"""Password accounts and opaque cookie sessions, separate from commerce writes."""
import hashlib
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from collections import defaultdict, deque
from http.cookies import CookieError, SimpleCookie

# Two independent sessions in one browser: the shop account (customers) and the staff panel never share a cookie, so
# signing in to /admin does not replace a customer login and signing out of one leaves the other untouched.
COOKIE = '__Host-zastal_session'
STAFF_COOKIE = '__Host-zastal_staff'
STAFF_AUTH_PREFIX = '/api/staff/auth/'


def scope_of(path):
    """'staff' for the panel API (and its sign-in routes), 'customer' for everything else."""
    return 'staff' if path.startswith(('/api/admin/', '/api/staff/')) else 'customer'


def cookie_name(scope):
    return STAFF_COOKIE if scope == 'staff' else COOKIE
SITE_ORIGIN = os.environ.get('ZASTAL_SITE_ORIGIN', 'https://zastalstore.51-15-21-164.sslip.io').rstrip('/')
STAFF_ROLES = ('admin', 'manager', 'warehouse', 'cashier', 'production', 'orders')
ROLES = ('customer',) + STAFF_ROLES
ROLE_LABELS = {'admin': 'Właściciel / administrator', 'manager': 'Menedżer sklepu', 'warehouse': 'Magazyn',
               'cashier': 'Kasjer', 'production': 'Produkcja / nadruki', 'orders': 'Obsługa zamówień'}
CAPABILITIES = ('cms', 'products', 'players', 'customers', 'orders', 'fulfillment', 'inventory', 'transfers',
                'production', 'labels', 'pos', 'shifts', 'discounts', 'email', 'launch', 'staff', 'settings',
                'returns', 'audit', 'pages')
ROLE_CAPABILITIES = {
    'admin': set(CAPABILITIES),
    'manager': set(CAPABILITIES) - {'staff', 'launch'},
    'warehouse': {'inventory', 'transfers', 'labels', 'fulfillment', 'audit'},
    'cashier': {'pos', 'shifts', 'customers', 'labels'},
    'production': {'production', 'transfers', 'fulfillment', 'labels'},
    'orders': {'orders', 'fulfillment', 'customers', 'email', 'returns', 'labels'},
}
# Route prefix -> capability needed for writes; reads of shared operational data need any staff role.
ROUTE_CAPABILITIES = (
    ('/api/admin/home', 'cms', 'cms'), ('/api/admin/pages', 'pages', 'pages'),
    ('/api/admin/launch', 'launch', 'launch'), ('/api/admin/staff', 'staff', 'staff'),
    ('/api/admin/settings', 'settings', 'settings'), ('/api/admin/shipping', 'settings', 'settings'),
    ('/api/admin/pos', 'pos', 'pos'), ('/api/admin/shifts', 'shifts', 'shifts'),
    ('/api/admin/fulfillment', 'fulfillment', 'fulfillment'), ('/api/admin/email', 'email', 'email'),
    ('/api/admin/customers', 'customers', 'customers'), ('/api/admin/returns', 'returns', 'returns'),
    ('/api/admin/activity', 'audit', 'audit'), ('/api/admin/promo', 'settings', 'settings'), ('/api/admin/price-alerts', 'settings', 'settings'),
    ('/api/admin/stock-alerts', 'inventory', 'inventory'), ('/api/admin/giftcards', 'settings', 'settings'),
    ('/api/admin/reports', 'settings', 'settings'), ('/api/admin/digest', 'settings', None),
    ('/api/admin/products', 'products', None), ('/api/admin/players', 'players', None),
    ('/api/admin/orders', 'orders', None), ('/api/admin/inventory', 'inventory', None),
    ('/api/admin/stock-events', None, None), ('/api/admin/transfers', 'transfers', None),
    ('/api/admin/production', 'production', None),
    ('/api/admin/subscribers', 'customers', 'customers'),
    ('/api/admin/contact', 'customers', 'customers'), ('/api/admin/brand', 'cms', 'cms'),
)
TTL = {None: 3600, 'customer': 7 * 86400}
TTL.update({role: 8 * 3600 for role in STAFF_ROLES})
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
    if row is None:
        return None
    result = {field: row[field] for field in ('id', 'identifier', 'name', 'role', 'created')}
    result['email_verified'] = bool(row['email_verified'])
    if row['role'] in STAFF_ROLES:
        result['capabilities'] = sorted(ROLE_CAPABILITIES[row['role']])
    return result


def is_staff(user):
    return bool(user) and user['role'] in STAFF_ROLES


def capabilities(user):
    return ROLE_CAPABILITIES.get(user['role'], set()) if user else set()


def capability_for(method, path):
    """Capability required by a staff route; None means any active staff account."""
    for prefix, write, read in ROUTE_CAPABILITIES:
        if path == prefix or path.startswith(prefix + '/'):
            return write if method in ('POST', 'PATCH', 'PUT', 'DELETE') else read
    return None


def require_staff(handler, capability=None):
    user = require_user(handler)
    if not is_staff(user):
        raise AuthError(403, 'To konto nie ma dostępu do tej części sklepu.', 'role_required')
    if capability and capability not in capabilities(user):
        raise AuthError(403, 'Twoja rola nie pozwala na tę operację.', 'capability_required')
    return user


def staff_identifier_value(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z0-9][a-z0-9._@-]{2,63}', value.strip().casefold()):
        raise AuthError(400, 'Login pracownika: 3–64 znaki (litery, cyfry, kropka, myślnik, @).')
    return value.strip().casefold()


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
    import commerce_email as email
    email.init_schema(c)
    migrate_roles(c)
    if bootstrap_secret and not c.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        c.execute("INSERT INTO users(identifier,name,role,password_hash,created,updated) VALUES('admin','Administrator','admin',?,datetime('now'),datetime('now'))",
                  (hash_password(bootstrap_secret),))


def migrate_roles(c):
    """Rebuild users once so the role CHECK accepts staff roles; data and ids are preserved."""
    definition = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
    if not definition or "'manager'" in definition[0]:
        return
    columns = [row['name'] for row in c.execute('PRAGMA table_info(users)')]
    names = ','.join(columns)
    roles = ','.join("'" + role + "'" for role in ROLES)
    c.executescript(f"""
        PRAGMA foreign_keys=OFF;
        BEGIN;
        CREATE TABLE IF NOT EXISTS commerce_migrations(name TEXT PRIMARY KEY);
        CREATE TABLE users_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT, identifier TEXT UNIQUE NOT NULL COLLATE NOCASE,
            name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ({roles})),
            password_hash TEXT NOT NULL, recovery_hash TEXT, active INTEGER NOT NULL DEFAULT 1,
            created TEXT NOT NULL, updated TEXT NOT NULL,
            email_verified INTEGER NOT NULL DEFAULT 0);
        INSERT INTO users_v2({names}) SELECT {names} FROM users;
        DROP TABLE users;
        ALTER TABLE users_v2 RENAME TO users;
        INSERT OR IGNORE INTO commerce_migrations(name) VALUES('staff-roles-2026-10-24');
        COMMIT;
        PRAGMA foreign_keys=ON;
    """)


def session(handler, c, create=False):
    handler.response_headers = getattr(handler, 'response_headers', [])
    scope = scope_of(handler.path.split('?', 1)[0])
    handler.auth_scope = scope
    name = cookie_name(scope)
    try:
        cookies = SimpleCookie(handler.headers.get('Cookie', ''))
        raw = cookies[name].value if name in cookies else ''
    except CookieError:
        raw = ''
    entry = c.execute('SELECT * FROM auth_sessions WHERE token_hash=? AND expires>?',
                      (digest(raw), int(time.time()))).fetchone() if 20 <= len(raw) <= 128 else None
    user = c.execute('SELECT * FROM users WHERE id=? AND active=1', (entry['user_id'],)).fetchone() if entry and entry['user_id'] else None
    if entry and entry['user_id'] and not user:
        entry = None
    # A session only counts in its own scope: a staff account is never "the customer" of the shop, and the other way round.
    if user and (user['role'] == 'customer') != (scope == 'customer'):
        entry, user = None, None
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
    scope = getattr(handler, 'auth_scope', 'customer')
    seconds = TTL[user['role'] if user else None]
    c.execute('INSERT INTO auth_sessions VALUES(?,?,?,?,?)',
              (digest(raw), user['id'] if user else None, csrf, int(time.time()), int(time.time()) + seconds))
    handler.response_headers.append(('Set-Cookie', f'{cookie_name(scope)}={raw}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age={seconds}'))
    entry = c.execute('SELECT * FROM auth_sessions WHERE token_hash=?', (digest(raw),)).fetchone()
    handler.request_session, handler.request_user = entry, user
    return entry, user


def end_session(handler, c):
    """Sign out. A busy or failing database must never keep someone signed in on screen: after two short attempts the
    cookie is expired anyway (the stored session then simply runs out on its own) and False is returned."""
    c.execute('PRAGMA busy_timeout=3000')
    for attempt in range(2):
        try:
            rotate(handler, c, None)
            return True
        except sqlite3.Error:
            c.rollback()
            time.sleep(0.25)
    scope = getattr(handler, 'auth_scope', 'customer')
    handler.response_headers.append(('Set-Cookie', f'{cookie_name(scope)}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'))
    handler.request_session, handler.request_user = {'csrf_token': ''}, None
    sys.stderr.write(f'[auth] sign-out could not update the session table (scope {scope}); cookie expired instead\n')
    return False


def require_user(handler, role=None):
    user = getattr(handler, 'request_user', None)
    if not user:
        raise AuthError(401, 'Zaloguj się, aby kontynuować.', 'session_required')
    if role and user['role'] != role:
        raise AuthError(403, 'To konto nie ma dostępu do tej części sklepu.', 'role_required')
    return user


# Extra origins only for staging/E2E hosts (comma separated); production keeps the single HTTPS origin.
ALLOWED_ORIGINS = {SITE_ORIGIN} | {item.strip().rstrip('/') for item in os.environ.get('ZASTAL_ALLOWED_ORIGINS', '').split(',') if item.strip()}


def check_origin(handler):
    origin = handler.headers.get('Origin')
    if (origin and origin.rstrip('/') not in ALLOWED_ORIGINS) or handler.headers.get('Sec-Fetch-Site') == 'cross-site':
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


def staff_public(row):
    return {'id': row['id'], 'identifier': row['identifier'], 'name': row['name'], 'role': row['role'],
            'role_label': ROLE_LABELS.get(row['role'], row['role']), 'active': bool(row['active']),
            'created': row['created'], 'capabilities': sorted(ROLE_CAPABILITIES.get(row['role'], set()))}


def staff_dispatch(handler, path, c):
    """Owner-only staff account management. Caller already enforced the 'staff' capability."""
    if path != '/api/admin/staff' and not re.fullmatch(r'/api/admin/staff/[1-9][0-9]*', path):
        return False
    actor = require_staff(handler, 'staff')
    if handler.command == 'GET' and path == '/api/admin/staff':
        rows = c.execute("SELECT * FROM users WHERE role!='customer' ORDER BY id").fetchall()
        handler.respond(200, {'staff': [staff_public(row) for row in rows],
                              'roles': [{'id': role, 'label': ROLE_LABELS[role], 'capabilities': sorted(ROLE_CAPABILITIES[role])} for role in STAFF_ROLES]})
        return True
    if handler.command == 'POST' and path == '/api/admin/staff':
        data = handler.body()
        identifier = staff_identifier_value(data.get('identifier'))
        name, role = name_value(data.get('name')), data.get('role')
        if role not in STAFF_ROLES:
            raise AuthError(400, 'Wybierz rolę pracownika.')
        encoded = hash_password(password_value(data))
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM users WHERE identifier=?', (identifier,)).fetchone():
            raise AuthError(409, 'Ten login jest już zajęty.')
        cursor = c.execute("INSERT INTO users(identifier,name,role,password_hash,created,updated) VALUES(?,?,?,?,datetime('now'),datetime('now'))",
                           (identifier, name, role, encoded))
        c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,datetime(\'now\'))',
                  ('staff', str(cursor.lastrowid), f'Administrator {actor["id"]}: utworzono konto {identifier} ({ROLE_LABELS[role]})'))
        row = c.execute('SELECT * FROM users WHERE id=?', (cursor.lastrowid,)).fetchone()
        c.commit()
        handler.respond(201, staff_public(row))
        return True
    if handler.command == 'PATCH' and path != '/api/admin/staff':
        data = handler.body()
        target = int(path.rsplit('/', 1)[1])
        if not any(key in data for key in ('name', 'role', 'active', 'password')):
            raise AuthError(400, 'Podaj dane do zmiany.')
        encoded = hash_password(password_value(data)) if 'password' in data else None
        c.execute('BEGIN IMMEDIATE')
        row = c.execute("SELECT * FROM users WHERE id=? AND role!='customer'", (target,)).fetchone()
        if not row:
            raise AuthError(404, 'Nie znaleziono konta pracownika.')
        name = name_value(data['name']) if 'name' in data else row['name']
        role = data.get('role', row['role'])
        if role not in STAFF_ROLES:
            raise AuthError(400, 'Wybierz rolę pracownika.')
        active = data.get('active', bool(row['active']))
        if not isinstance(active, bool):
            raise AuthError(400, 'Status konta musi być wartością logiczną.')
        if target == actor['id'] and (not active or role != 'admin'):
            raise AuthError(409, 'Nie możesz zablokować ani zdegradować własnego konta.')
        if row['role'] == 'admin' and (role != 'admin' or not active) and not c.execute(
                "SELECT 1 FROM users WHERE role='admin' AND active=1 AND id!=?", (target,)).fetchone():
            raise AuthError(409, 'Sklep musi mieć co najmniej jedno aktywne konto administratora.')
        c.execute("UPDATE users SET name=?,role=?,active=?,updated=datetime('now') WHERE id=?", (name, role, int(active), target))
        if encoded:
            c.execute("UPDATE users SET password_hash=?,recovery_hash=NULL WHERE id=?", (encoded, target))
        if not active or encoded or role != row['role']:
            c.execute('DELETE FROM auth_sessions WHERE user_id=?', (target,))
        changes = ', '.join(key for key in ('name', 'role', 'active', 'password') if key in data)
        c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,datetime(\'now\'))',
                  ('staff', str(target), f'Administrator {actor["id"]}: zmieniono konto {row["identifier"]}: {changes}'))
        updated = c.execute('SELECT * FROM users WHERE id=?', (target,)).fetchone()
        c.commit()
        handler.respond(200, staff_public(updated))
        return True
    raise AuthError(405, 'Niedozwolona metoda.')


def dispatch(handler, path, c):
    """Returns True for a handled route; commit before sending successful replies."""
    method = handler.command
    staff_scope = path.startswith(STAFF_AUTH_PREFIX)
    if staff_scope:
        # The panel signs in on its own routes with the same logic and its own cookie (see scope_of).
        tail = path[len(STAFF_AUTH_PREFIX):]
        if tail in ('session', 'login', 'logout', 'recover'):
            path = '/api/auth/' + tail
        elif tail in ('profile', 'password', 'recovery-key', 'logout-others'):
            path = '/api/account/' + tail
        else:
            return False
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
        import commerce_email as email
        email.queue_verification(c, user)
        rotate(handler, c, user)
        extra['recovery_key'], status = key, 201
    elif path == '/api/auth/login':
        identifier, password = identifier_value(data.get('identifier')), data.get('password')
        if not isinstance(password, str) or len(password) > 128:
            raise AuthError(401, 'Nieprawidłowy login lub hasło.', 'credentials_invalid')
        rate(handler, 'login', identifier)
        user = c.execute('SELECT * FROM users WHERE identifier=?', (identifier,)).fetchone()
        valid = verify_password(password, user['password_hash'] if user else None)
        # Same message for a wrong password and for the wrong door (a staff login on the shop or a customer in the panel).
        if not user or not valid or not user['active'] or (user['role'] == 'customer') == staff_scope:
            raise AuthError(401, 'Nieprawidłowy login lub hasło.', 'credentials_invalid')
        verified_hash = user['password_hash']
        c.execute('BEGIN IMMEDIATE')
        user = c.execute('SELECT * FROM users WHERE id=? AND active=1', (user['id'],)).fetchone()
        if not user or user['password_hash'] != verified_hash:
            raise AuthError(401, 'Nieprawidłowy login lub hasło.', 'credentials_invalid')
        rotate(handler, c, user)
    elif path == '/api/auth/logout':
        end_session(handler, c)
    elif path == '/api/auth/recover':
        identifier, password = identifier_value(data.get('identifier')), password_value(data)
        rate(handler, 'recover', identifier, count=5)
        key = data.get('recovery_key')
        if not isinstance(key, str) or len(key) > 128:
            raise AuthError(400, 'Nieprawidłowy login lub klucz odzyskiwania.')
        user = c.execute('SELECT * FROM users WHERE identifier=?', (identifier,)).fetchone()
        if (not user or not user['active'] or not user['recovery_hash'] or (user['role'] == 'customer') == staff_scope
                or not secrets.compare_digest(digest(key), user['recovery_hash'])):
            raise AuthError(400, 'Nieprawidłowy login lub klucz odzyskiwania.')
        encoded, new_key = hash_password(password), secrets.token_urlsafe(32)
        c.execute('BEGIN IMMEDIATE')
        cursor = c.execute("UPDATE users SET password_hash=?,recovery_hash=?,updated=datetime('now') WHERE id=? AND recovery_hash=? AND active=1",
                           (encoded, digest(new_key), user['id'], user['recovery_hash']))
        if cursor.rowcount != 1:
            raise AuthError(400, 'Klucz został już użyty. Użyj aktualnego klucza odzyskiwania.')
        import commerce_email as email
        email.invalidate_tokens(c, user['id'])
        user = c.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
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
                import commerce_email as email
                email.invalidate_tokens(c, user['id'])
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
