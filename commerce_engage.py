"""Customer engagement: newsletter with double opt-in and contact messages.

Everything here is opt-in data given by shoppers themselves; nothing is sent anywhere without the
addressee's own action (a confirmation link for the newsletter). Money is never involved, so the module only needs ordinary transactions.
"""
import datetime as dt
import hashlib
import json
import re
import secrets
import unicodedata

EMAIL = re.compile(r'[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}')
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
    c.execute('DROP TABLE IF EXISTS reviews')  # the review feature was removed before launch
    c.executescript('''
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
    new_messages = c.execute('SELECT COUNT(*) FROM contact_messages WHERE status=?', ('new',)).fetchone()[0]
    confirmed = c.execute('SELECT COUNT(*) FROM subscribers WHERE status=?', ('confirmed',)).fetchone()[0]
    return {'new_messages': new_messages, 'subscribers': confirmed}
