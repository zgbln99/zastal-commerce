"""Daily digest for the staff: what needs attention today, sent once a day by e-mail and shown on the dashboard.

Sections: orders to fulfil, pickups waiting at the counter, orders waiting for payment for more than a day,
open returns, sizes running out, sold-out sizes with customers waiting, products without sales for 60 days,
and yesterday's sales. Real data only; nothing is invented.
"""
import datetime as dt
import json
import re
import sqlite3
from zoneinfo import ZoneInfo

LOCAL = ZoneInfo('Europe/Warsaw')
EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$')
SEND_HOUR = 7
LOW_STOCK = 3
STALE_DAYS = 60
UNPAID_HOURS = 24


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def _q(c, sql, params=()):
    try:
        return c.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return []


def build(c, now=None):
    now = now or now_utc()
    today = now.astimezone(LOCAL).strftime('%Y-%m-%d')
    yesterday = (now.astimezone(LOCAL) - dt.timedelta(days=1)).strftime('%Y-%m-%d')
    unpaid_cutoff = (now - dt.timedelta(hours=UNPAID_HOURS)).isoformat(timespec='seconds')
    to_fulfil = [dict(r) for r in _q(c, '''SELECT o.id,o.total,o.status,o.created,d.shipping_kind FROM orders o JOIN order_details d ON d.order_id=o.id
        WHERE d.mode='live' AND d.payment_status IN ('paid','partially_refunded') AND o.status IN ('oplacone','potwierdzone','do_kompletacji','nanoszenie_dtf','kontrola_jakosci')
        AND NOT EXISTS (SELECT 1 FROM pos_sales p WHERE p.order_id=o.id) ORDER BY o.id''')]
    pickups = [dict(r) for r in _q(c, '''SELECT o.id,o.total,o.created,d.customer_name FROM orders o JOIN order_details d ON d.order_id=o.id
        WHERE d.mode='live' AND o.status='spakowane' AND d.shipping_kind='pickup' AND NOT EXISTS (SELECT 1 FROM pos_sales p WHERE p.order_id=o.id) ORDER BY o.id''')]
    unpaid = [dict(r) for r in _q(c, '''SELECT o.id,o.total,o.created,d.payment_method FROM orders o JOIN order_details d ON d.order_id=o.id
        WHERE d.mode='live' AND o.status='oczekuje_platnosci' AND o.created<? ORDER BY o.created''', (unpaid_cutoff,))]
    returns = [dict(r) for r in _q(c, "SELECT id,order_id,kind,status,created FROM returns WHERE status IN ('zgloszony','przyjety') ORDER BY id")]
    low_stock = [dict(r) for r in _q(c, '''SELECT p.id AS product_id,p.name,v.size,v.sku,v.stock FROM product_variants v JOIN products p ON p.id=v.product_id
        LEFT JOIN product_options o ON o.product_id=p.id WHERE v.stock BETWEEN 1 AND ? AND COALESCE(o.gift_card,0)=0 ORDER BY v.stock,p.name,v.id LIMIT 30''', (LOW_STOCK,))]
    sold_out = [dict(r) for r in _q(c, '''SELECT p.id AS product_id,p.name,v.size,v.sku,
        (SELECT COUNT(*) FROM stock_alerts a WHERE a.variant_id=v.id AND a.notified_at IS NULL) AS waiting
        FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN product_options o ON o.product_id=p.id
        WHERE v.stock=0 AND COALESCE(o.gift_card,0)=0 AND COALESCE(o.preorder,0)=0 ORDER BY waiting DESC,p.name,v.id LIMIT 30''')]
    since = (now - dt.timedelta(days=STALE_DAYS)).isoformat(timespec='seconds')
    sold_skus = set()
    for row in _q(c, '''SELECT o.items FROM orders o LEFT JOIN order_details d ON d.order_id=o.id LEFT JOIN pos_sales p ON p.order_id=o.id
        WHERE o.created>=? AND o.status NOT IN ('anulowane') AND ((d.mode='live' AND d.payment_status IN ('paid','partially_refunded')) OR p.demo=0)''', (since,)):
        try:
            sold_skus.update(item.get('sku') for item in json.loads(row['items'] or '[]'))
        except ValueError:
            pass
    stale = [dict(r) for r in _q(c, '''SELECT p.id AS product_id,p.name,p.sku,p.stock FROM products p LEFT JOIN product_options o ON o.product_id=p.id
        WHERE p.stock>0 AND COALESCE(o.gift_card,0)=0 ORDER BY p.name''') if r['sku'] not in sold_skus]
    import commerce_reports as reports
    try:
        day = reports.sales(c, yesterday, yesterday)
        sales_yesterday = {'orders': day['totals']['orders'], 'revenue': day['totals']['revenue'], 'online': day['by_channel']['online']['revenue'], 'pos': day['by_channel']['pos']['revenue']}
    except Exception:
        sales_yesterday = {'orders': 0, 'revenue': 0, 'online': 0, 'pos': 0}
    waiting_total = sum(row['waiting'] for row in sold_out)
    return {'date': today, 'yesterday': yesterday, 'to_fulfil': to_fulfil, 'pickups': pickups, 'unpaid': unpaid, 'returns': returns,
            'low_stock': low_stock, 'sold_out': sold_out, 'stale': stale, 'sales_yesterday': sales_yesterday,
            'summary': {'to_fulfil': len(to_fulfil), 'pickups': len(pickups), 'unpaid': len(unpaid), 'returns': len(returns),
                        'low_stock': len(low_stock), 'sold_out': len(sold_out), 'waiting': waiting_total, 'stale': len(stale)}}


def _pln(value):
    return f'{value / 100:.2f} PLN'


def _order(oid):
    return f'ZS-{oid:05d}'


def message(c, date, origin):
    data = build(c)
    s = data['summary']
    lines = [f'Podsumowanie dla obsługi Zastal Store, {date}', '',
             f'Wczoraj ({data["yesterday"]}): {data["sales_yesterday"]["orders"]} sprzedaży, {_pln(data["sales_yesterday"]["revenue"])} '
             f'(online {_pln(data["sales_yesterday"]["online"])}, kasa {_pln(data["sales_yesterday"]["pos"])}).', '']
    lines.append(f'DO REALIZACJI: {s["to_fulfil"]} opłaconych zamówień' + (':' if data['to_fulfil'] else '.'))
    lines += [f'  {_order(o["id"])} · {_pln(o["total"])} · {o["status"]}' for o in data['to_fulfil'][:15]]
    lines.append(f'CZEKAJĄ NA ODBIÓR W SKLEPIE: {s["pickups"]}' + (':' if data['pickups'] else '.'))
    lines += [f'  {_order(o["id"])} · {o["customer_name"] or "klient"} · od {o["created"][:10]}' for o in data['pickups'][:15]]
    lines.append(f'BEZ PŁATNOŚCI PONAD {UNPAID_HOURS} H: {s["unpaid"]}' + (':' if data['unpaid'] else '.'))
    lines += [f'  {_order(o["id"])} · {_pln(o["total"])} · {o["payment_method"]} · {o["created"][:16]}' for o in data['unpaid'][:15]]
    lines.append(f'OTWARTE ZWROTY I REKLAMACJE: {s["returns"]}' + (':' if data['returns'] else '.'))
    lines += [f'  #{r["id"]} · {_order(r["order_id"])} · {r["kind"]} · {r["status"]}' for r in data['returns'][:15]]
    lines += ['', f'MAGAZYN', f'Kończą się (do {LOW_STOCK} szt.): {s["low_stock"]}' + (':' if data['low_stock'] else '.')]
    lines += [f'  {v["name"]} / {v["size"]} · {v["stock"]} szt. · {v["sku"]}' for v in data['low_stock'][:20]]
    lines.append(f'Wyprzedane rozmiary: {s["sold_out"]}, klientów czekających na powiadomienie: {s["waiting"]}' + (':' if data['sold_out'] else '.'))
    lines += [f'  {v["name"]} / {v["size"]}' + (f' · czeka {v["waiting"]}' if v['waiting'] else '') for v in data['sold_out'][:20]]
    lines.append(f'Bez sprzedaży od {STALE_DAYS} dni (a są na stanie): {s["stale"]}' + (':' if data['stale'] else '.'))
    lines += [f'  {p["name"]} · {p["stock"]} szt.' for p in data['stale'][:20]]
    lines += ['', f'Panel: {origin}/admin']
    return f'Zastal Store, podsumowanie dnia {date}', '\n'.join(lines) + '\n'


def recipient(c):
    import commerce_sales as sales
    config = sales.settings(c)
    if not config.get('digest_enabled'):
        return ''
    address = (config.get('digest_email') or '').strip().casefold()
    if not address:
        try:
            import commerce_launch as launch
            address = (launch.values(c).get('support_email') or '').strip().casefold()
        except Exception:
            address = ''
    return address if EMAIL.fullmatch(address) else ''


def enqueue(c, now=None):
    """Queue today's digest once; returns the recipient or '' when nothing was queued."""
    import commerce_email as mail
    now = now or now_utc()
    address = recipient(c)
    if not address:
        return ''
    date = now.astimezone(LOCAL).strftime('%Y-%m-%d')
    mail.enqueue_guest(c, 'staff_digest', address, f'staff_digest:{date}')
    c.execute("INSERT INTO store_settings(key,value,changed_at) VALUES('digest_last_sent',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,changed_at=excluded.changed_at",
              (date, now.isoformat(timespec='seconds')))
    return address


def send_daily(c, now=None):
    """Called by the maintenance timer: weekdays only, after SEND_HOUR local time, at most once per day."""
    now = now or now_utc()
    local = now.astimezone(LOCAL)
    if local.weekday() >= 5 or local.hour < SEND_HOUR:
        return ''
    row = c.execute("SELECT value FROM store_settings WHERE key='digest_last_sent'").fetchone()
    if row and row['value'] >= local.strftime('%Y-%m-%d'):
        return ''
    return enqueue(c, now)
