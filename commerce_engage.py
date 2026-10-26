"""Customer engagement: product reviews with moderation, newsletter with double opt-in, contact messages.

Everything here is opt-in data given by shoppers themselves; nothing is sent anywhere without the
addressee's own action (a confirmation link for the newsletter, a published review only after staff
approval). Money is never involved, so the module only needs ordinary transactions.
"""
import datetime as dt
import hashlib
import json
import re
import secrets
import unicodedata

EMAIL = re.compile(r'[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}')
REVIEW_STATUSES = ('pending', 'approved', 'rejected')
SUBSCRIBER_STATUSES = ('pending', 'confirmed', 'unsubscribed')
MESSAGE_STATUSES = ('new', 'answered', 'closed')
CONFIRM_TTL_HOURS = 72


class EngageError(Exception):
    def __init__(self, status, message, code='invalid_request'):
        super().__init__(message)
        self.status, self.code = status, code


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def stamp(moment=None):
    return (moment or now_utc()).isoformat(timespec='seconds')


def init_schema(c):
    c.executescript('''
        CREATE TABLE IF NOT EXISTS reviews(
            id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
            author TEXT NOT NULL, email TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
            content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
            verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)), order_id INTEGER,
            reply TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, moderated_at TEXT, moderated_by TEXT NOT NULL DEFAULT '',
            UNIQUE(product_id,email));
        CREATE TABLE IF NOT EXISTS subscribers(
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','unsubscribed')),
            token_digest TEXT NOT NULL, token_issued TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'form',
            created TEXT NOT NULL, confirmed_at TEXT, unsubscribed_at TEXT);
        CREATE TABLE IF NOT EXISTS contact_messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL, order_ref TEXT NOT NULL DEFAULT '', created TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','answered','closed')), note TEXT NOT NULL DEFAULT '');
    ''')


# ------------------------------------------------------------------ validation helpers
def _text(value, label, maximum, minimum=1):
    if not isinstance(value, str):
        raise EngageError(400, f'Podaj: {label}')
    if any(unicodedata.category(ch) == 'Cc' and ch not in '\n\r\t' for ch in value):
        raise EngageError(400, f'Nieprawidłowe znaki w polu: {label}')
    value = re.sub(r'[ \t]+', ' ', value.replace('\r\n', '\n')).strip()
    if len(value) < minimum:
        raise EngageError(400, f'Podaj: {label}')
    if len(value) > maximum:
        raise EngageError(400, f'Za długie pole: {label} (maks. {maximum} znaków)')
    return value


def _email(value):
    if not isinstance(value, str) or not EMAIL.fullmatch(value.strip()):
        raise EngageError(400, 'Podaj poprawny adres e-mail', 'invalid_email')
    return value.strip().casefold()


def _honeypot(data):
    # Bots fill every field; the storefront keeps this one hidden and empty.
    if data.get('website'):
        raise EngageError(400, 'Nie udało się wysłać formularza')


# ------------------------------------------------------------------ reviews
def _bought(c, product_id, email):
    """A paid live order from this address that contains the product: the review is a verified purchase."""
    product = c.execute('SELECT sku FROM products WHERE id=?', (product_id,)).fetchone()
    variant_skus = {row['sku'] for row in c.execute('SELECT sku FROM product_variants WHERE product_id=?', (product_id,))}
    skus = variant_skus | ({product['sku']} if product else set())
    rows = c.execute('''SELECT o.id,o.items FROM orders o JOIN order_details d ON d.order_id=o.id
                        WHERE d.customer_email=? AND d.mode='live' AND d.payment_status IN ('paid','partially_refunded')
                        ORDER BY o.id DESC LIMIT 50''', (email,)).fetchall()
    for row in rows:
        try:
            items = json.loads(row['items'])
        except ValueError:
            continue
        # Order lines carry SKUs (product and variant), never the catalogue id.
        if any(isinstance(item, dict) and (item.get('sku') in skus or item.get('variant_sku') in skus) for item in items):
            return row['id']
    return None


def submit_review(c, data):
    if not isinstance(data, dict):
        raise EngageError(400, 'Nieprawidłowe dane')
    _honeypot(data)
    product_id = data.get('product_id')
    if isinstance(product_id, bool) or not isinstance(product_id, int):
        raise EngageError(400, 'Wybierz produkt')
    product = c.execute('SELECT id,name FROM products WHERE id=?', (product_id,)).fetchone()
    if not product:
        raise EngageError(404, 'Produkt nie istnieje', 'product_not_found')
    rating = data.get('rating')
    if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
        raise EngageError(400, 'Wybierz ocenę od 1 do 5 gwiazdek', 'invalid_rating')
    author = _text(data.get('author'), 'imię', 60)
    email = _email(data.get('email'))
    content = _text(data.get('content'), 'treść opinii', 2000, minimum=10)
    if c.execute('SELECT 1 FROM reviews WHERE product_id=? AND email=? AND status<>?', (product_id, email, 'rejected')).fetchone():
        raise EngageError(409, 'Z tego adresu dodano już opinię o tym produkcie', 'already_reviewed')
    order_id = _bought(c, product_id, email)
    c.execute('DELETE FROM reviews WHERE product_id=? AND email=? AND status=?', (product_id, email, 'rejected'))
    c.execute('INSERT INTO reviews(product_id,author,email,rating,content,verified,order_id,created) VALUES(?,?,?,?,?,?,?,?)',
              (product_id, author, email, rating, content, 1 if order_id else 0, order_id, stamp()))
    return {'ok': True, 'message': 'Dziękujemy. Opinia pojawi się po sprawdzeniu przez obsługę sklepu.', 'verified': bool(order_id)}


def _public_review(row):
    return {'id': row['id'], 'author': row['author'], 'rating': row['rating'], 'content': row['content'],
            'created': row['created'], 'verified': bool(row['verified']), 'reply': row['reply']}


def product_reviews(c, product_id, limit=50):
    rows = c.execute('SELECT * FROM reviews WHERE product_id=? AND status=? ORDER BY verified DESC,id DESC LIMIT ?',
                     (product_id, 'approved', limit)).fetchall()
    return {'summary': summary(c, product_id), 'reviews': [_public_review(r) for r in rows]}


def summary(c, product_id):
    rows = c.execute('SELECT rating,COUNT(*) AS n FROM reviews WHERE product_id=? AND status=? GROUP BY rating', (product_id, 'approved')).fetchall()
    distribution = {str(star): 0 for star in range(1, 6)}
    for row in rows:
        distribution[str(row['rating'])] = row['n']
    count = sum(distribution.values())
    average = round(sum(int(star) * n for star, n in distribution.items()) / count, 2) if count else 0
    return {'count': count, 'average': average, 'distribution': distribution}


def annotate(c, products):
    """Attach approved rating summaries to catalogue rows (cards, JSON-LD) in one query."""
    rows = c.execute('SELECT product_id,COUNT(*) AS n,AVG(rating) AS avg FROM reviews WHERE status=? GROUP BY product_id', ('approved',)).fetchall()
    ratings = {row['product_id']: {'count': row['n'], 'average': round(row['avg'], 2)} for row in rows}
    for product in products:
        product['rating'] = ratings.get(product['id'], {'count': 0, 'average': 0})
    return products


def admin_reviews(c, status=''):
    where, params = ('WHERE r.status=?', (status,)) if status in REVIEW_STATUSES else ('', ())
    rows = c.execute(f'''SELECT r.*,p.name AS product_name FROM reviews r JOIN products p ON p.id=r.product_id {where}
                         ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 500''', params).fetchall()
    return [dict(r) for r in rows]


def moderate(c, review_id, data, staff):
    row = c.execute('SELECT * FROM reviews WHERE id=?', (review_id,)).fetchone()
    if not row:
        raise EngageError(404, 'Nie znaleziono opinii')
    updates, params = [], []
    if 'status' in data:
        if data['status'] not in REVIEW_STATUSES:
            raise EngageError(400, 'Nieznany status opinii')
        updates += ['status=?', 'moderated_at=?', 'moderated_by=?']
        params += [data['status'], stamp(), staff]
    if 'reply' in data:
        updates.append('reply=?')
        params.append(_text(data['reply'], 'odpowiedź', 1000, minimum=0))
    if not updates:
        raise EngageError(400, 'Brak zmian')
    c.execute(f'UPDATE reviews SET {",".join(updates)} WHERE id=?', (*params, review_id))
    return dict(c.execute('SELECT r.*,p.name AS product_name FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.id=?', (review_id,)).fetchone())


# ------------------------------------------------------------------ newsletter
def _digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def subscribe(c, data, source='form'):
    """Record a signup and queue the confirmation e-mail. Always answers the same way, so the form never reveals who is on the list."""
    import commerce_email as mail
    if not isinstance(data, dict):
        raise EngageError(400, 'Nieprawidłowe dane')
    _honeypot(data)
    email = _email(data.get('email'))
    if data.get('consent') is not True:
        raise EngageError(400, 'Zaznacz zgodę na otrzymywanie wiadomości', 'consent_required')
    row = c.execute('SELECT * FROM subscribers WHERE email=?', (email,)).fetchone()
    if row and row['status'] == 'confirmed':
        return {'ok': True, 'pending': False, 'message': 'Ten adres jest już zapisany. Dziękujemy!'}
    raw = secrets.token_urlsafe(24)
    if row:
        c.execute('UPDATE subscribers SET status=?,token_digest=?,token_issued=?,source=?,unsubscribed_at=NULL WHERE id=?',
                  ('pending', _digest(raw), stamp(), source[:30], row['id']))
        subscriber_id = row['id']
    else:
        c.execute('INSERT INTO subscribers(email,status,token_digest,token_issued,source,created) VALUES(?,?,?,?,?,?)',
                  (email, 'pending', _digest(raw), stamp(), source[:30], stamp()))
        subscriber_id = c.execute('SELECT last_insert_rowid()').fetchone()[0]
    mail.enqueue_guest(c, 'newsletter_confirm', email, f'newsletter_confirm:{subscriber_id}:{raw[:8]}')
    return {'ok': True, 'pending': True, 'message': 'Prawie gotowe. Potwierdź zapis, klikając link, który wysłaliśmy e-mailem.'}


def subscribe_quietly(c, email, source):
    """Checkout consent: the same double opt-in, errors never break the order."""
    try:
        return subscribe(c, {'email': email, 'consent': True}, source)
    except EngageError:
        return None


def _by_token(c, token):
    if not isinstance(token, str) or not 20 <= len(token) <= 64:
        raise EngageError(400, 'Nieprawidłowy link', 'invalid_token')
    row = c.execute('SELECT * FROM subscribers WHERE token_digest=?', (_digest(token),)).fetchone()
    if not row:
        raise EngageError(404, 'Ten link jest nieaktualny. Zapisz się ponownie.', 'invalid_token')
    return row


def confirm(c, token):
    row = _by_token(c, token)
    if row['status'] == 'confirmed':
        return {'ok': True, 'status': 'confirmed', 'message': 'Zapis był już potwierdzony. Dziękujemy!'}
    issued = dt.datetime.fromisoformat(row['token_issued'])
    if now_utc() - issued > dt.timedelta(hours=CONFIRM_TTL_HOURS):
        raise EngageError(410, 'Link wygasł. Zapisz się ponownie, a wyślemy nowy.', 'token_expired')
    c.execute('UPDATE subscribers SET status=?,confirmed_at=? WHERE id=?', ('confirmed', stamp(), row['id']))
    return {'ok': True, 'status': 'confirmed', 'message': 'Zapis potwierdzony. Dziękujemy!'}


def unsubscribe(c, token):
    row = _by_token(c, token)
    if row['status'] != 'unsubscribed':
        c.execute('UPDATE subscribers SET status=?,unsubscribed_at=? WHERE id=?', ('unsubscribed', stamp(), row['id']))
    return {'ok': True, 'status': 'unsubscribed', 'message': 'Adres został wypisany z newslettera.'}


def newsletter_message(c, dedupe_key, origin):
    """Confirmation e-mail. The raw token is not stored, so it is re-issued here and the digest rotated: the link in the
    most recent message is the one that works, which is also what a shopper who clicks "resend" expects."""
    parts = dedupe_key.split(':')
    row = c.execute('SELECT * FROM subscribers WHERE id=?', (int(parts[1]),)).fetchone()
    if not row or row['status'] != 'pending':
        return None
    raw = secrets.token_urlsafe(24)
    c.execute('UPDATE subscribers SET token_digest=?,token_issued=? WHERE id=?', (_digest(raw), stamp(), row['id']))
    confirm_url = f'{origin}/newsletter?token={raw}'
    unsubscribe_url = f'{origin}/newsletter?token={raw}&action=wypisz'
    body = ('Potwierdź zapis do newslettera sklepu Zastal Zielona Góra:\n\n' + confirm_url +
            f'\n\nLink jest ważny przez {CONFIRM_TTL_HOURS} godziny. Będziemy pisać tylko o nowościach, premierach i promocjach w sklepie klubowym.\n'
            'Jeżeli to nie Ty podałeś ten adres, zignoruj tę wiadomość: bez potwierdzenia nic nie wyślemy.\n\n'
            f'Wypisanie się: {unsubscribe_url}\n')
    return 'Zastal Store, potwierdź zapis do newslettera', body


def unsubscribe_token(c, subscriber_id):
    """Fresh token for the footer link of a campaign message (one per message, so links stay single-purpose)."""
    raw = secrets.token_urlsafe(24)
    c.execute('UPDATE subscribers SET token_digest=?,token_issued=? WHERE id=?', (_digest(raw), stamp(), subscriber_id))
    return raw


def admin_subscribers(c, status=''):
    where, params = ('WHERE status=?', (status,)) if status in SUBSCRIBER_STATUSES else ('', ())
    rows = c.execute(f'SELECT id,email,status,source,created,confirmed_at,unsubscribed_at FROM subscribers {where} ORDER BY id DESC LIMIT 5000', params).fetchall()
    return [dict(r) for r in rows]


def subscribers_csv(rows):
    out = ['﻿email;status;zrodlo;zapis;potwierdzenie;wypisanie']
    for row in rows:
        out.append(';'.join(_csv_cell(row[key] or '') for key in ('email', 'status', 'source', 'created', 'confirmed_at', 'unsubscribed_at')))
    return '\n'.join(out) + '\n'


def _csv_cell(value):
    value = str(value)
    if value[:1] in ('=', '+', '-', '@'):
        value = "'" + value
    return '"' + value.replace('"', '""') + '"' if any(ch in value for ch in ';"\n') else value


def set_subscriber_status(c, subscriber_id, status):
    if status not in SUBSCRIBER_STATUSES:
        raise EngageError(400, 'Nieznany status')
    row = c.execute('SELECT id FROM subscribers WHERE id=?', (subscriber_id,)).fetchone()
    if not row:
        raise EngageError(404, 'Nie znaleziono adresu')
    c.execute('UPDATE subscribers SET status=?,unsubscribed_at=CASE WHEN ?=? THEN ? ELSE unsubscribed_at END WHERE id=?',
              (status, status, 'unsubscribed', stamp(), subscriber_id))
    return {'ok': True}


# ------------------------------------------------------------------ contact messages
def submit_contact(c, data):
    import commerce_email as mail
    if not isinstance(data, dict):
        raise EngageError(400, 'Nieprawidłowe dane')
    _honeypot(data)
    name = _text(data.get('name'), 'imię i nazwisko', 80)
    email = _email(data.get('email'))
    topic = _text(data.get('topic', ''), 'temat', 120, minimum=0)
    order_ref = _text(data.get('order', ''), 'numer zamówienia', 20, minimum=0)
    if order_ref and not re.fullmatch(r'(ZS-)?[0-9]{1,8}', order_ref, re.IGNORECASE):
        raise EngageError(400, 'Numer zamówienia ma postać ZS-00012', 'invalid_order')
    message = _text(data.get('message'), 'treść wiadomości', 4000, minimum=10)
    c.execute('INSERT INTO contact_messages(name,email,topic,message,order_ref,created) VALUES(?,?,?,?,?,?)',
              (name, email, topic, message, order_ref.upper(), stamp()))
    message_id = c.execute('SELECT last_insert_rowid()').fetchone()[0]
    support = support_address(c)
    if support:
        mail.enqueue_guest(c, 'contact_received', support, f'contact_received:{message_id}')
    mail.enqueue_guest(c, 'contact_ack', email, f'contact_ack:{message_id}')
    return {'ok': True, 'id': message_id, 'message': 'Dziękujemy. Odpowiemy e-mailem, zwykle w ciągu jednego dnia roboczego.'}


def support_address(c):
    try:
        import commerce_launch as launch
        return (launch.values(c).get('support_email') or '').strip().casefold()
    except Exception:
        return ''


def contact_message(c, dedupe_key, origin, kind):
    row = c.execute('SELECT * FROM contact_messages WHERE id=?', (int(dedupe_key.rsplit(':', 1)[1]),)).fetchone()
    if not row:
        return None
    if kind == 'contact_received':
        body = (f'Nowa wiadomość z formularza kontaktowego sklepu (nr {row["id"]}).\n\n'
                f'Od: {row["name"]} <{row["email"]}>\n' + (f'Temat: {row["topic"]}\n' if row['topic'] else '') +
                (f'Zamówienie: {row["order_ref"]}\n' if row['order_ref'] else '') +
                f'\n{row["message"]}\n\nOdpowiedz bezpośrednio na adres klienta. Lista wiadomości: {origin}/admin\n')
        return f'[Kontakt] {row["topic"] or "Wiadomość ze sklepu"} · {row["name"]}', body
    body = (f'Dzień dobry,\n\notrzymaliśmy Twoją wiadomość' + (f' w sprawie zamówienia {row["order_ref"]}' if row['order_ref'] else '') +
            '. Odpowiemy e-mailem, zwykle w ciągu jednego dnia roboczego.\n\nTreść wiadomości:\n' + row['message'] +
            f'\n\nSklep Zastalu Zielona Góra\n{origin}\n')
    return 'Zastal Store, otrzymaliśmy Twoją wiadomość', body


def admin_messages(c, status=''):
    where, params = ('WHERE status=?', (status,)) if status in MESSAGE_STATUSES else ('', ())
    rows = c.execute(f'SELECT * FROM contact_messages {where} ORDER BY CASE status WHEN ? THEN 0 ELSE 1 END, id DESC LIMIT 500', (*params, 'new')).fetchall()
    return [dict(r) for r in rows]


def update_message(c, message_id, data):
    row = c.execute('SELECT id FROM contact_messages WHERE id=?', (message_id,)).fetchone()
    if not row:
        raise EngageError(404, 'Nie znaleziono wiadomości')
    updates, params = [], []
    if 'status' in data:
        if data['status'] not in MESSAGE_STATUSES:
            raise EngageError(400, 'Nieznany status')
        updates.append('status=?')
        params.append(data['status'])
    if 'note' in data:
        updates.append('note=?')
        params.append(_text(data['note'], 'notatka', 1000, minimum=0))
    if not updates:
        raise EngageError(400, 'Brak zmian')
    c.execute(f'UPDATE contact_messages SET {",".join(updates)} WHERE id=?', (*params, message_id))
    return dict(c.execute('SELECT * FROM contact_messages WHERE id=?', (message_id,)).fetchone())


def counts(c):
    """Open work for the staff dashboard and digest."""
    pending = c.execute('SELECT COUNT(*) FROM reviews WHERE status=?', ('pending',)).fetchone()[0]
    new_messages = c.execute('SELECT COUNT(*) FROM contact_messages WHERE status=?', ('new',)).fetchone()[0]
    confirmed = c.execute('SELECT COUNT(*) FROM subscribers WHERE status=?', ('confirmed',)).fetchone()[0]
    return {'pending_reviews': pending, 'new_messages': new_messages, 'subscribers': confirmed}
