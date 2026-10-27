"""Online withdrawal from a distance contract (a consumer's statement), recorded for staff and confirmed by e-mail.

The statement is a two-step action on the storefront (fill in, then confirm). Every accepted statement gets a
confirmation on a durable medium (the e-mail), so the consumer can prove when it was made. Whether the withdrawal
is legally available for the goods (for example print made to the buyer's specification) is decided by staff.
"""
import datetime as dt
import re
import commerce_auth as auth
import commerce_email as mail
import commerce_sales as sales
from commerce_returns import ReturnError

STATES = ('zlozone', 'obsluzone')
MAX_PER_ORDER = 3
MAX_PENDING_TOTAL = 500
SCOPES = ('all', 'part')


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def init_schema(c):
    c.execute('''CREATE TABLE IF NOT EXISTS withdrawals(
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
        scope TEXT NOT NULL CHECK(scope IN ('all','part')), note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'zlozone' CHECK(status IN ('zlozone','obsluzone')),
        staff_note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, handled TEXT)''')
    c.execute('CREATE INDEX IF NOT EXISTS withdrawals_order ON withdrawals(order_id)')


def _text(value, label, maximum, required=False):
    if value is None:
        value = ''
    if not isinstance(value, str) or len(value) > maximum or any(ord(ch) < 32 and ch not in '\n' for ch in value):
        raise ReturnError(400, 'Nieprawidłowe pole: ' + label)
    value = value.strip()
    if required and not value:
        raise ReturnError(400, 'Pole jest wymagane: ' + label)
    return value


def submit(c, data):
    """Public statement. Needs the order number and the e-mail given in the order; answers are the same for every miss."""
    if not isinstance(data, dict):
        raise ReturnError(400, 'Oczekiwano danych formularza')
    if data.get('website'):
        return {'ok': True}
    if data.get('confirm') is not True:
        raise ReturnError(400, 'Potwierdź odstąpienie od umowy, aby je złożyć', 'not_confirmed')
    number = data.get('order')
    if not isinstance(number, str) or not re.fullmatch(r'\s*(?:ZS-)?0*[1-9][0-9]{0,9}\s*', number.upper()):
        raise ReturnError(400, 'Podaj numer zamówienia (np. ZS-00012)')
    order_id = int(re.sub(r'[^0-9]', '', number))
    try:
        email = auth.identifier_value(data.get('email'), email=True)
    except auth.AuthError as ex:
        raise ReturnError(400, str(ex))
    name = _text(data.get('name'), 'imię i nazwisko', 120, required=True)
    scope = data.get('scope', 'all')
    if scope not in SCOPES:
        raise ReturnError(400, 'Wybierz zakres odstąpienia')
    note = _text(data.get('note'), 'opis', 600, required=scope == 'part')
    detail = sales.details(c, order_id)
    owner = c.execute('SELECT u.identifier FROM order_receipts r JOIN users u ON u.id=r.customer_id WHERE r.order_id=?', (order_id,)).fetchone()
    known = {(detail['customer_email'] if detail else '').casefold(), (owner['identifier'] if owner else '').casefold()} - {''}
    miss = ReturnError(404, 'Nie znaleziono zamówienia o podanym numerze i adresie e-mail', 'order_not_found')
    if not detail or email not in known:
        raise miss
    if detail['mode'] != 'live':
        raise ReturnError(409, 'To zamówienie testowe, nie można dla niego odstąpić od umowy', 'order_not_live')
    if c.execute('SELECT COUNT(*) FROM withdrawals WHERE order_id=?', (order_id,)).fetchone()[0] >= MAX_PER_ORDER:
        raise ReturnError(409, 'Dla tego zamówienia złożono już oświadczenia. Napisz do nas, jeśli coś trzeba doprecyzować.', 'withdrawal_limit')
    if c.execute("SELECT COUNT(*) FROM withdrawals WHERE status='zlozone'").fetchone()[0] >= MAX_PENDING_TOTAL:
        raise ReturnError(503, 'Formularz jest chwilowo niedostępny. Napisz do nas e-mailem.', 'withdrawal_busy')
    now = stamp()
    wid = c.execute('INSERT INTO withdrawals(order_id,email,name,scope,note,created) VALUES(?,?,?,?,?,?)', (order_id, email, name, scope, note, now)).lastrowid
    c.execute('INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)',
              ('withdrawal', str(wid), f'Oświadczenie o odstąpieniu od umowy do zamówienia {order_id} ({"całość" if scope == "all" else "część"})', now))
    import commerce_engage as engage
    support = engage.support_address(c)
    if support:
        mail.enqueue_guest(c, 'withdrawal_received', support, f'withdrawal_received:{wid}')
    mail.enqueue_guest(c, 'withdrawal_ack', email, f'withdrawal_ack:{wid}')
    return {'ok': True, 'id': wid, 'created': now}


def message(c, dedupe_key, origin, kind):
    row = c.execute('SELECT * FROM withdrawals WHERE id=?', (int(dedupe_key.rsplit(':', 1)[1]),)).fetchone()
    if not row:
        return None
    ref = f'ZS-{row["order_id"]:05d}'
    scope = 'całości zamówienia' if row['scope'] == 'all' else 'części zamówienia'
    if kind == 'withdrawal_received':
        body = (f'Klient złożył oświadczenie o odstąpieniu od umowy (nr {row["id"]}, {row["created"]}).\n\n'
                f'Zamówienie: {ref}\nKlient: {row["name"]} <{row["email"]}>\nZakres: {scope}\n' + (f'Opis: {row["note"]}\n' if row['note'] else '') +
                f'\nOceń, czy odstąpienie przysługuje (np. produkty z nadrukiem na zamówienie) i odpowiedz klientowi. Lista: {origin}/admin\n')
        return f'[Odstąpienie] zamówienie {ref} · {row["name"]}', body
    import commerce_launch as launch
    address = launch.values(c).get('returns_address', '').strip()
    body = (f'Dzień dobry,\n\npotwierdzamy, że {row["created"].replace("T", " ").replace("+00:00", " UTC")} otrzymaliśmy Twoje oświadczenie o odstąpieniu od umowy dotyczącej zamówienia {ref} ({scope}).\n\n'
            f'Imię i nazwisko: {row["name"]}\n' + (f'Opis: {row["note"]}\n' if row['note'] else '') +
            '\nCo dalej: sprawdzimy zamówienie i odpowiemy e-mailem. Jeśli odstąpienie przysługuje, wskażemy, jak odesłać towar' +
            (f' (adres do zwrotów: {address})' if address else '') +
            '. Prawo odstąpienia nie przysługuje w odniesieniu do rzeczy wykonanych według Twojej specyfikacji, np. z wybranym nadrukiem.\n\n'
            f'Sklep Zastalu Zielona Góra\n{origin}\n')
    return f'Zastal Store, potwierdzenie odstąpienia od umowy ({ref})', body


def listing(c, open_only=True):
    where = "WHERE status='zlozone'" if open_only else ''
    return [dict(row) for row in c.execute(f'SELECT * FROM withdrawals {where} ORDER BY id DESC LIMIT 300')]


def update(c, wid, data):
    row = c.execute('SELECT id FROM withdrawals WHERE id=?', (wid,)).fetchone()
    if not row:
        raise ReturnError(404, 'Nie znaleziono oświadczenia')
    if not isinstance(data, dict) or data.get('status') not in STATES:
        raise ReturnError(400, 'Nieznany status')
    note = _text(data.get('staff_note'), 'notatka', 600)
    c.execute('UPDATE withdrawals SET status=?,staff_note=?,handled=? WHERE id=?', (data['status'], note, stamp() if data['status'] == 'obsluzone' else None, wid))
    return dict(c.execute('SELECT * FROM withdrawals WHERE id=?', (wid,)).fetchone())
