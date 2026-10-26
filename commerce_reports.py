"""Sales reports for the owner and the accountant: by day, channel, payment method and product.

Only real sales count: live online orders that were paid and non-demo POS sales.
Cancelled orders are excluded; refunds settled in the period are reported separately.
Order value = products + delivery - discount; a gift card is a way of paying, not a discount.
"""
import csv
import datetime as dt
import io
import json
import re
import sqlite3
from collections import defaultdict
from zoneinfo import ZoneInfo

LOCAL = ZoneInfo('Europe/Warsaw')
DATE = re.compile(r'^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
PAYMENT_LABELS = {'payu': 'PayU', 'transfer': 'Przelew', 'pickup': 'Przy odbiorze', 'giftcard': 'Karta podarunkowa',
                  'pos_cash': 'Kasa: gotówka', 'pos_terminal': 'Kasa: terminal'}


class ReportError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.status = 400


def period(start, end):
    today = dt.datetime.now(LOCAL).strftime('%Y-%m-%d')
    start = start or today
    end = end or start
    if not (isinstance(start, str) and DATE.fullmatch(start) and isinstance(end, str) and DATE.fullmatch(end)):
        raise ReportError('Daty w formacie RRRR-MM-DD')
    if end < start:
        raise ReportError('Koniec okresu przed początkiem')
    if (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days > 400:
        raise ReportError('Okres raportu: maksymalnie 400 dni')
    return start, end


def _local_day(created):
    try:
        moment = dt.datetime.fromisoformat(created)
    except (TypeError, ValueError):
        return ''
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=dt.timezone.utc)
    return moment.astimezone(LOCAL).strftime('%Y-%m-%d')


def _rows(c, scope):
    try:
        return c.execute('''SELECT o.id,o.created,o.items,o.total,o.status,d.mode,d.payment_method,d.payment_status,d.discount,d.gift_card_amount,
                                   s.order_id AS pos_order,s.payment_method AS pos_payment,s.demo,r.shipping_fee,r.subtotal,r.customer_id
                            FROM orders o LEFT JOIN order_details d ON d.order_id=o.id LEFT JOIN pos_sales s ON s.order_id=o.id
                            LEFT JOIN order_receipts r ON r.order_id=o.id WHERE o.status NOT IN ('anulowane') ORDER BY o.id''').fetchall()
    except sqlite3.OperationalError:
        return []


def sales(c, start, end, scope='live'):
    start, end = period(start, end)
    days = defaultdict(lambda: {'orders': 0, 'revenue': 0, 'online': 0, 'pos': 0})
    channels = {'online': {'orders': 0, 'revenue': 0}, 'pos': {'orders': 0, 'revenue': 0}}
    payments = defaultdict(lambda: {'orders': 0, 'revenue': 0})
    products = defaultdict(lambda: {'qty': 0, 'revenue': 0, 'name': ''})
    totals = {'orders': 0, 'revenue': 0, 'products': 0, 'shipping': 0, 'discount': 0, 'gift_card': 0, 'items': 0}
    orders = []
    for row in _rows(c, scope):
        pos = row['pos_order'] is not None
        real = (row['demo'] == 0) if pos else (row['mode'] == 'live' and row['payment_status'] in ('paid', 'partially_refunded'))
        demo = (row['demo'] == 1) if pos else (row['mode'] == 'test')
        if scope == 'live' and not real:
            continue
        if scope == 'test' and not demo:
            continue
        day = _local_day(row['created'])
        if not start <= day <= end:
            continue
        gift = row['gift_card_amount'] or 0
        value = (row['total'] or 0) + (0 if pos else gift)  # POS totals already include the part paid by card
        channel = 'pos' if pos else 'online'
        method = ('pos_' + row['pos_payment']) if pos else (row['payment_method'] or '')
        try:
            items = json.loads(row['items'] or '[]')
        except ValueError:
            items = []
        totals['orders'] += 1
        totals['revenue'] += value
        totals['shipping'] += row['shipping_fee'] or 0
        totals['discount'] += row['discount'] or 0
        totals['gift_card'] += gift
        days[day]['orders'] += 1
        days[day]['revenue'] += value
        days[day][channel] += value
        channels[channel]['orders'] += 1
        channels[channel]['revenue'] += value
        payments[method]['orders'] += 1
        payments[method]['revenue'] += value
        for item in items:
            qty = int(item.get('qty', 1) or 0)
            line_value = int(item.get('unit_price', 0) or 0) * qty
            totals['items'] += qty
            totals['products'] += line_value
            key = item.get('sku') or item.get('name', '')
            products[key]['qty'] += qty
            products[key]['revenue'] += line_value
            products[key]['name'] = item.get('name', key)
        orders.append({'id': row['id'], 'day': day, 'channel': channel, 'payment': PAYMENT_LABELS.get(method, method), 'value': value,
                       'discount': row['discount'] or 0, 'gift_card': gift, 'items': sum(int(i.get('qty', 1) or 0) for i in items), 'status': row['status']})
    refunds = {'count': 0, 'amount': 0}
    try:
        for row in c.execute("SELECT refund_amount,resolved_at FROM returns WHERE status='rozliczony' AND refund_amount>0"):
            day = _local_day(row['resolved_at'] or '')
            if start <= day <= end:
                refunds['count'] += 1
                refunds['amount'] += row['refund_amount']
    except sqlite3.OperationalError:
        pass
    by_day = [{'day': day, **values} for day, values in sorted(days.items())]
    by_product = sorted(({'sku': key, **values} for key, values in products.items()), key=lambda p: (-p['revenue'], p['sku']))
    by_payment = [{'method': key, 'label': PAYMENT_LABELS.get(key, key or 'inne'), **values} for key, values in sorted(payments.items())]
    totals['average'] = totals['revenue'] // totals['orders'] if totals['orders'] else 0
    return {'from': start, 'to': end, 'scope': scope, 'totals': totals, 'by_day': by_day, 'by_channel': channels, 'by_payment': by_payment,
            'by_product': by_product, 'refunds': refunds, 'orders': orders}


def _pln(value):
    return f'{value / 100:.2f}'.replace('.', ',')


def _cell(value):
    """Text cells never start with a formula trigger; spreadsheets would otherwise evaluate product names."""
    text = str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@', '\t', '\r') else text


def csv_export(report, kind):
    """Semicolon CSV with a BOM and decimal commas, the format Polish spreadsheets open without asking."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=';', lineterminator='\r\n')
    if kind == 'product':
        writer.writerow(['SKU', 'Produkt', 'Sztuk', 'Wartość PLN'])
        for row in report['by_product']:
            writer.writerow([_cell(row['sku']), _cell(row['name']), row['qty'], _pln(row['revenue'])])
    elif kind == 'orders':
        writer.writerow(['Zamówienie', 'Dzień', 'Kanał', 'Płatność', 'Pozycji', 'Rabat PLN', 'Karta podarunkowa PLN', 'Wartość PLN', 'Status'])
        for row in report['orders']:
            writer.writerow([f'ZS-{row["id"]:05d}', row['day'], 'sklep online' if row['channel'] == 'online' else 'kasa', _cell(row['payment']), row['items'],
                             _pln(row['discount']), _pln(row['gift_card']), _pln(row['value']), _cell(row['status'])])
    else:
        writer.writerow(['Dzień', 'Zamówień', 'Sklep online PLN', 'Kasa PLN', 'Razem PLN'])
        for row in report['by_day']:
            writer.writerow([row['day'], row['orders'], _pln(row['online']), _pln(row['pos']), _pln(row['revenue'])])
        writer.writerow(['Razem', report['totals']['orders'], _pln(report['by_channel']['online']['revenue']), _pln(report['by_channel']['pos']['revenue']), _pln(report['totals']['revenue'])])
    return '\ufeff' + buffer.getvalue()
