"""Live sales mode, shipping/payment configuration and PayU adapter on isolated databases.

The PayU transport is replaced by an in-process fake; signatures are computed
with a fixture second key. No network access and no real credentials.
"""
import hashlib
import json
import os
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch
import commerce_api as api
import commerce_auth as auth
import commerce_payments as payments
import commerce_sales as sales
from http_client import Client

ADMIN_PASSWORD = 'Fixture admin password 2026'
PAYU_ENV = {'ZASTAL_PAYU_POS_ID': '300746', 'ZASTAL_PAYU_CLIENT_ID': '300746', 'ZASTAL_PAYU_CLIENT_SECRET': 'fixture-secret',
            'ZASTAL_PAYU_SECOND_KEY': 'fixture-second-key', 'ZASTAL_PAYU_ENV': 'sandbox', 'ZASTAL_SITE_ORIGIN': 'https://store.example.test',
            'ZASTAL_SMTP_HOST': 'smtp.example.test', 'ZASTAL_SMTP_FROM': 'sklep@example.test', 'ZASTAL_SMTP_PORT': '587', 'ZASTAL_SMTP_TLS': 'starttls'}
SELLER = {'seller_name': 'Zastal Sp. z o.o.', 'tax_id': '5260250995', 'business_address': 'ul. Testowa 1, 65-001 Zielona Góra',
          'support_email': 'sklep@example.test', 'support_phone': '600000000', 'returns_address': 'ul. Testowa 1, 65-001 Zielona Góra',
          'terms_url': 'https://store.example.test/regulamin', 'privacy_url': 'https://store.example.test/prywatnosc',
          'returns_url': 'https://store.example.test/zwroty', 'shipping_url': 'https://store.example.test/dostawa',
          'brand_approved': True, 'catalog_reviewed': True, 'inventory_counted': True, 'supplier_confirmed': True}


class FakePayU:
    """Records outbound calls and answers like PayU's REST API."""
    def __init__(self):
        self.calls = []
        self.fail_orders = False

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, body))
        if url.endswith('/oauth/authorize'):
            return 200, {}, json.dumps({'access_token': 'fixture-token', 'expires_in': 3600}).encode()
        if url.endswith('/api/v2_1/orders'):
            if self.fail_orders:
                return 400, {}, json.dumps({'status': {'statusCode': 'ERROR_VALUE_INVALID'}}).encode()
            payload = json.loads(body)
            return 302, {}, json.dumps({'status': {'statusCode': 'SUCCESS'}, 'redirectUri': 'https://secure.snd.payu.com/pay/?id=abc',
                                        'orderId': 'PAYU-' + payload['extOrderId'], 'extOrderId': payload['extOrderId']}).encode()
        if '/refunds' in url:
            return 200, {}, json.dumps({'status': {'statusCode': 'SUCCESS'}, 'refund': {'refundId': 'RF-1', 'status': 'PENDING'}}).encode()
        return 404, {}, b'{}'


def signed(body, key=PAYU_ENV['ZASTAL_PAYU_SECOND_KEY'], algorithm='MD5'):
    raw = json.dumps(body).encode()
    digest = (hashlib.md5 if algorithm == 'MD5' else hashlib.sha256)(raw + key.encode()).hexdigest()
    return raw, f'sender=checkout;signature={digest};algorithm={algorithm};content=DOCUMENT'


class SalesTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'sales.sqlite3'
        api.TOKEN = ADMIN_PASSWORD
        api.LIMITS.clear()
        auth.clear_limits()
        payments.clear_token_cache()
        self.env = patch.dict(os.environ, {**PAYU_ENV, 'ZASTAL_SALES_MODE': 'live'})
        self.env.start()
        os.environ.pop('ZASTAL_TEST_MODE', None)
        self.fake = FakePayU()
        self.transport = patch.object(payments, 'TRANSPORT', self.fake)
        self.transport.start()
        api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products VALUES(1,'Koszulka','TS','Koszulki',7900,15)")
            c.execute("INSERT INTO products VALUES(2,'Worek','AC','Akcesoria',5000,10)")
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.port = self.server.server_address[1]
        self.admin = Client(self.port)
        self.assertEqual(self.admin.login('admin', ADMIN_PASSWORD)[0], 200)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.transport.stop()
        self.env.stop()
        os.environ['ZASTAL_TEST_MODE'] = 'isolated-only'
        self.folder.cleanup()

    def public(self, method, path, body=None, headers=None):
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}' + path, method=method,
                                         headers={'Content-Type': 'application/json', **(headers or {})},
                                         data=json.dumps(body).encode() if isinstance(body, (dict, list)) else body)
        try:
            with urllib.request.urlopen(request, timeout=8) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as r:
            return r.status, json.load(r)

    def go_live(self, payu=True, transfer=True, pickup_payment=True):
        self.assertEqual(self.admin.request('PATCH', '/api/admin/launch', SELLER)[0], 200)
        code, data = self.admin.request('PATCH', '/api/admin/settings', {
            'transfer_enabled': transfer, 'transfer_recipient': 'Zastal Sp. z o.o.', 'transfer_account': 'PL61 1090 1014 0000 0712 1981 2874',
            'transfer_bank': 'Bank', 'pickup_payment_enabled': pickup_payment, 'payu_enabled': payu,
            'pickup_address': 'Sklep klubowy, ul. Sulechowska 41, Zielona Góra', 'pickup_hours': 'pn–pt 10–18', 'fiscal_confirmed': True})
        self.assertEqual(code, 200, data)
        kurier = next(m for m in data['readiness'] and self.admin.request('GET', '/api/admin/shipping')[1] if m['code'] == 'kurier')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/shipping/' + str(kurier['id']), {'enabled': True, 'carrier': 'InPost', 'tracking_url': 'https://inpost.pl/sledzenie-przesylek?number={tracking}'})[0], 200)
        locker = next(m for m in self.admin.request('GET', '/api/admin/shipping')[1] if m['code'] == 'paczkomat')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/shipping/' + str(locker['id']), {'enabled': True})[0], 200)
        return self.public('GET', '/api/store/status')[1]

    def order(self, **extra):
        payload = {'items': [{'id': 1, 'size': 'L', 'quantity': 1}], 'idempotency_key': 'live-order-key-00000001',
                   'customer': {'email': 'kibic@example.test', 'name': 'Jan Kibic', 'phone': '600 100 200'},
                   'shipping': {'method': 'kurier', 'address': {'line1': 'ul. Zielona 5', 'postal_code': '65-001', 'city': 'Zielona Góra'}},
                   'payment': 'transfer', 'consents': {'terms': True, 'privacy': True}}
        payload.update(extra)
        return self.public('POST', '/api/orders', payload)

    # ------------------------------------------------------------ mode gating
    def test_env_switch_alone_does_not_open_checkout(self):
        code, status = self.public('GET', '/api/store/status')
        self.assertEqual(status['phase'], 'prelaunch')
        self.assertFalse(status['checkout_enabled'])
        self.assertEqual(self.order()[0], 503)
        code, launch = self.admin.request('GET', '/api/admin/launch')
        self.assertTrue(launch['switch_present'])
        self.assertFalse(launch['sales_live'])
        self.assertIn('Podłączony i przetestowany operator płatności', launch['blocking'])

    def test_full_readiness_opens_checkout_and_reports_public_config(self):
        status = self.go_live()
        self.assertTrue(status['checkout_enabled'], status)
        config = status['config']
        self.assertEqual([m['id'] for m in config['payment_methods']], ['payu', 'transfer', 'pickup'])
        self.assertEqual({m['code'] for m in config['shipping_methods']}, {'odbior', 'paczkomat', 'kurier'})
        self.assertEqual(config['legal']['terms_url'], SELLER['terms_url'])
        self.assertNotIn('transfer_account', json.dumps(config))
        code, health = self.public('GET', '/health')
        self.assertEqual(health['sales_phase'], 'live')
        with patch.dict(os.environ, {'ZASTAL_SALES_MODE': 'prelaunch'}):
            self.assertFalse(self.public('GET', '/api/store/status')[1]['checkout_enabled'])

    def test_live_checkout_validates_customer_address_consents_and_payment(self):
        self.go_live()
        cases = [
            ({'consents': {'terms': True}}, 'consent_required'),
            ({'customer': {'name': 'Jan'}}, None),
            ({'shipping': {'method': 'kurier', 'address': {'line1': 'x', 'postal_code': '65001', 'city': 'ZG'}}}, 'invalid_address'),
            ({'shipping': {'method': 'paczkomat', 'address': {'line1': 'x', 'postal_code': '65-001', 'city': 'ZG'}}}, None),
            ({'payment': 'pickup'}, 'invalid_payment'),
            ({'payment': 'blik'}, 'invalid_payment'),
            ({'invoice': {'requested': True, 'company': 'Firma', 'tax_id': '1234567890', 'address': 'x'}}, 'invalid_invoice'),
        ]
        for extra, code in cases:
            status, data = self.order(**extra)
            self.assertEqual(status, 400, (extra, data))
            if code:
                self.assertEqual(data['code'], code, extra)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 3)

    def test_transfer_order_waits_for_payment_then_manual_confirmation_and_shipment(self):
        self.go_live()
        code, reply = self.order(invoice={'requested': True, 'company': 'Firma Kibic', 'tax_id': '5260250995', 'address': 'ul. Firmowa 2, 65-001 Zielona Góra'})
        self.assertEqual(code, 201, reply)
        self.assertEqual(reply['status'], 'oczekuje_platnosci')
        self.assertEqual(reply['mode'], 'live')
        self.assertEqual(reply['transfer']['title'], f"ZASTAL ZS-{reply['id']:05d}")
        self.assertEqual(reply['transfer']['account'], 'PL61109010140000071219812874')
        self.assertEqual(reply['total'], 7900 + 1499)
        # Same key replays the same reply without a second order.
        self.assertEqual(self.order(invoice={'requested': True, 'company': 'Firma Kibic', 'tax_id': '5260250995', 'address': 'ul. Firmowa 2, 65-001 Zielona Góra'}), (200, reply))
        code, receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")
        self.assertFalse(receipt['demo'])
        self.assertEqual(receipt['details']['address']['city'], 'Zielona Góra')
        self.assertEqual(receipt['details']['invoice']['tax_id'], '5260250995')
        self.assertNotIn('payment_note', receipt['details'])
        with api.connect() as c:
            outbox = c.execute('SELECT kind,recipient,user_id FROM email_outbox ORDER BY id').fetchall()
            self.assertEqual([tuple(row) for row in outbox], [('order_created', 'kibic@example.test', None)])
            subject, body = sales.order_email(c, c.execute('SELECT * FROM orders WHERE id=?', (reply['id'],)).fetchone(), sales.details(c, reply['id']), 'order_created', 'https://store.example.test')
            self.assertIn('potwierdzenie zamówienia', subject)
            self.assertIn('PL61109010140000071219812874', body)
            self.assertIn('Zastal Sp. z o.o.', body)
            self.assertNotIn('testow', body)
        # Unpaid orders stay out of the fulfillment queue and cannot be moved forward manually.
        self.assertEqual([o['id'] for o in self.admin.request('GET', '/api/admin/fulfillment')[1]], [])
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/orders/{reply['id']}", {'status': 'do_kompletacji'})[0], 400)
        code, confirmed = self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm', 'note': 'wyciąg 24.10'})
        self.assertEqual((code, confirmed['status'], confirmed['details']['payment_status']), (200, 'oplacone', 'paid'))
        self.assertEqual([o['id'] for o in self.admin.request('GET', '/api/admin/fulfillment')[1]], [reply['id']])
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM email_outbox WHERE kind='order_paid'").fetchone()[0], 1)
        # Shipment only after packing; recorded tracking produces a tracking link and customer status.
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/shipment", {'carrier': 'InPost', 'tracking_number': '620000012345'})[0], 409)
        with api.connect() as c:
            c.execute("UPDATE orders SET status='spakowane' WHERE id=?", (reply['id'],))
            c.commit()
        code, shipped = self.admin.request('POST', f"/api/admin/orders/{reply['id']}/shipment", {'carrier': 'InPost', 'tracking_number': '620000012345'})
        self.assertEqual((code, shipped['status']), (200, 'wyslane'), shipped)
        self.assertEqual(shipped['details']['tracking_url'], 'https://inpost.pl/sledzenie-przesylek?number=620000012345')
        code, receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")
        self.assertEqual(receipt['status'], 'wyslane')
        self.assertEqual(receipt['details']['tracking_number'], '620000012345')

    def test_pickup_payment_confirms_order_and_unpaid_orders_expire(self):
        self.go_live()
        code, reply = self.order(shipping={'method': 'odbior'}, payment='pickup')
        self.assertEqual((code, reply['status']), (201, 'potwierdzone'), reply)
        code, reply2 = self.order(idempotency_key='live-order-key-00000002')
        self.assertEqual(reply2['status'], 'oczekuje_platnosci')
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 1)
            c.execute("UPDATE orders SET created='2020-01-01T00:00:00+00:00' WHERE id=?", (reply2['id'],))
            c.commit()
        code, result = self.admin.request('POST', '/api/admin/orders/expire-unpaid', {})
        self.assertEqual((code, result['cancelled']), (200, [reply2['id']]))
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 2)
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply2['id'],)).fetchone()[0], 'anulowane')
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply['id'],)).fetchone()[0], 'potwierdzone')

    # ------------------------------------------------------------ PayU
    def test_payu_order_redirect_signed_notification_and_refund(self):
        self.go_live()
        code, reply = self.order(payment='payu')
        self.assertEqual(code, 201, reply)
        self.assertEqual(reply['payment']['status'], 'pending')
        self.assertTrue(reply['payment']['redirect_url'].startswith('https://secure.snd.payu.com/'))
        create = next(call for call in self.fake.calls if call[1].endswith('/api/v2_1/orders'))
        sent = json.loads(create[3])
        self.assertEqual((sent['totalAmount'], sent['currencyCode'], sent['merchantPosId']), ('9399', 'PLN', '300746'))
        self.assertEqual(sent['notifyUrl'], 'https://store.example.test/api/payments/payu/notify')
        self.assertEqual(sent['buyer']['email'], 'kibic@example.test')
        self.assertEqual(create[2]['Authorization'], 'Bearer fixture-token')
        self.assertNotIn('fixture-secret', json.dumps(reply))
        ext = sent['extOrderId']
        notification = {'order': {'orderId': 'PAYU-' + ext, 'extOrderId': ext, 'status': 'COMPLETED', 'totalAmount': '9399', 'currencyCode': 'PLN'}}
        raw, bad = signed(notification, key='wrong-key')
        self.assertEqual(self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': bad})[0], 401)
        raw, header = signed({'order': {**notification['order'], 'totalAmount': '100'}}, algorithm='SHA-256')
        code, result = self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': header})
        self.assertEqual((code, result['result']), (200, 'amount_mismatch'))
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply['id'],)).fetchone()[0], 'oczekuje_platnosci')
        raw, header = signed(notification)
        code, result = self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': header})
        self.assertEqual((code, result['result']), (200, 'completed'))
        self.assertEqual(self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': header})[1]['result'], 'duplicate')
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply['id'],)).fetchone()[0], 'oplacone')
            detail = sales.details(c, reply['id'])
            self.assertEqual((detail['payment_status'], detail['paid_amount']), ('paid', 9399))
            self.assertEqual(c.execute("SELECT COUNT(*) FROM email_outbox WHERE kind='order_paid'").fetchone()[0], 1)
        code, receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")
        self.assertEqual(receipt['payment']['status'], 'completed')
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm'})[0], 400)
        # Refund through the provider, finalized by a later notification.
        code, refund = self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'refund', 'amount': 1499, 'note': 'zwrot dostawy'})
        self.assertEqual(code, 200, refund)
        self.assertEqual(refund['payments'][0]['refunds'][0]['status'], 'pending')
        raw, header = signed({'orderId': 'PAYU-' + ext, 'extOrderId': ext, 'refund': {'refundId': 'RF-1', 'amount': '1499', 'currencyCode': 'PLN', 'status': 'FINALIZED'}})
        self.assertEqual(self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': header})[1]['result'], 'refund_finalized')
        with api.connect() as c:
            self.assertEqual(sales.details(c, reply['id'])['payment_status'], 'partially_refunded')
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'refund', 'amount': 9000})[1]['code'], 'refund_exceeds_payment')

    def test_payu_failure_keeps_order_and_allows_retry_with_token(self):
        self.go_live()
        self.fake.fail_orders = True
        code, reply = self.order(payment='payu')
        self.assertEqual(code, 201, reply)
        self.assertEqual(reply['payment']['status'], None)
        with api.connect() as c:
            self.assertEqual(sales.details(c, reply['id'])['payment_status'], 'failed')
        self.fake.fail_orders = False
        self.assertEqual(self.public('POST', f"/api/orders/{reply['id']}/payment/retry", {'tracking_token': 'wrong'})[0], 404)
        code, retry = self.public('POST', f"/api/orders/{reply['id']}/payment/retry", {'tracking_token': reply['tracking_token']})
        self.assertEqual(code, 200, retry)
        self.assertTrue(retry['redirect_url'].startswith('https://'))
        raw, header = signed({'order': {'orderId': 'X', 'extOrderId': retry['ext_order_id'], 'status': 'CANCELED', 'totalAmount': '9399', 'currencyCode': 'PLN'}})
        self.assertEqual(self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': header})[1]['result'], 'canceled')
        code, receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")
        self.assertTrue(receipt['payment']['can_retry'])

    def test_payu_unconfigured_is_reported_and_excluded(self):
        with patch.dict(os.environ, {'ZASTAL_PAYU_SECOND_KEY': ''}):
            status = self.go_live()
            self.assertEqual([m['id'] for m in status['config']['payment_methods']], ['transfer', 'pickup'])
            code, settings = self.admin.request('GET', '/api/admin/settings')
            self.assertEqual(settings['payu']['missing'], ['ZASTAL_PAYU_SECOND_KEY'])
            self.assertNotIn('fixture-secret', json.dumps(settings))
            self.assertEqual(self.order(payment='payu')[1]['code'], 'invalid_payment')

    # ------------------------------------------------------------ configuration & roles
    def test_settings_and_shipping_validation_and_role_limits(self):
        self.assertEqual(self.admin.request('PATCH', '/api/admin/settings', {'transfer_account': '123'})[0], 400)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/settings', {'unknown': 1})[0], 400)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/settings', {'unpaid_hours': 0})[0], 400)
        code, created = self.admin.request('POST', '/api/admin/shipping', {'code': 'dpd', 'name': 'DPD kurier', 'kind': 'courier', 'price': 1599, 'free_from': 20000, 'enabled': False})
        self.assertEqual(code, 201, created)
        self.assertEqual(self.admin.request('POST', '/api/admin/shipping', {'code': 'dpd', 'name': 'x', 'kind': 'courier', 'price': 1})[0], 409)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/shipping/' + str(created['id']), {'tracking_url': 'http://insecure'})[0], 400)
        code, data = self.admin.request('POST', '/api/admin/staff', {'identifier': 'magazyn', 'name': 'Magazyn', 'role': 'warehouse', 'password': 'Staff member password 2026'})
        warehouse = Client(self.port)
        self.assertEqual(warehouse.login('magazyn', 'Staff member password 2026')[0], 200)
        self.assertEqual(warehouse.request('GET', '/api/admin/settings')[0], 403)
        self.assertEqual(warehouse.request('PATCH', '/api/admin/shipping/' + str(created['id']), {'enabled': True})[0], 403)
        code, data = self.admin.request('POST', '/api/admin/staff', {'identifier': 'kierownik', 'name': 'Kierownik', 'role': 'manager', 'password': 'Staff member password 2026'})
        manager = Client(self.port)
        self.assertEqual(manager.login('kierownik', 'Staff member password 2026')[0], 200)
        self.assertEqual(manager.request('PATCH', '/api/admin/settings', {'pickup_hours': 'pn–pt 10–18'})[0], 200)


    def test_live_pos_requires_shift_and_fiscal_number_and_reports_the_shift(self):
        self.go_live()
        self.assertEqual(self.admin.request('POST', '/api/admin/staff', {'identifier': 'kasa', 'name': 'Kasa', 'role': 'cashier', 'password': 'Staff member password 2026'})[0], 201)
        cashier = Client(self.port)
        self.assertEqual(cashier.login('kasa', 'Staff member password 2026')[0], 200)
        payload = {'items': [{'id': 1, 'size': 'L', 'quantity': 1}], 'idempotency_key': 'live-pos-sale-key-000001', 'payment_method': 'cash',
                   'payment_confirmed': True, 'fiscal': {'kind': 'paragon', 'number': '2026/10/000123'}, 'cash_received': 10000, 'handover': True}
        code, data = cashier.request('POST', '/api/admin/pos/sales', payload)
        self.assertEqual((code, data['code']), (409, 'shift_required'))
        code, shift = cashier.request('POST', '/api/admin/shifts/open', {'opening_cash': 20000})
        self.assertEqual((code, shift['status'], shift['opening_cash']), (201, 'open', 20000), shift)
        self.assertEqual(cashier.request('POST', '/api/admin/shifts/open', {'opening_cash': 1})[1]['code'], 'shift_open')
        code, data = cashier.request('POST', '/api/admin/pos/sales', {**payload, 'fiscal': None})
        self.assertEqual((code, data['code']), (400, 'fiscal_document_required'))
        code, data = cashier.request('POST', '/api/admin/pos/sales', {**payload, 'discount': 500, 'discount_reason': 'pracownik klubu'})
        self.assertEqual((code, data['code']), (403, 'discount_not_allowed'))
        code, sale = cashier.request('POST', '/api/admin/pos/sales', payload)
        self.assertEqual(code, 201, sale)
        self.assertFalse(sale['demo'])
        self.assertEqual((sale['status'], sale['total'], sale['change_due'], sale['fiscal']['number']), ('wydane', 7900, 2100, '2026/10/000123'))
        self.assertEqual(cashier.request('POST', '/api/admin/pos/sales', payload)[0], 200)
        code, discounted = self.admin.request('POST', '/api/admin/pos/sales', {**payload, 'idempotency_key': 'live-pos-sale-key-000002', 'payment_method': 'terminal',
                                                                                 'discount': 900, 'discount_reason': 'pracownik klubu', 'cash_received': 0})
        self.assertEqual((code, discounted['total'], discounted['discount']), (201, 7000, 900), discounted)
        code, work = self.admin.request('POST', '/api/admin/pos/sales', {**payload, 'idempotency_key': 'live-pos-sale-key-000003', 'items': [{'id': 1, 'size': 'L', 'quantity': 1}], 'handover': False})
        self.assertEqual((code, work['status']), (201, 'do_kompletacji'))
        self.assertEqual([o['id'] for o in self.admin.request('GET', '/api/admin/fulfillment')[1]], [work['id']])
        code, status = cashier.request('GET', '/api/admin/shifts')
        self.assertEqual(status['mode'], 'live')
        self.assertFalse(status['can_discount'])
        current = status['current']
        self.assertEqual((current['sales'], current['turnover'], current['by_method']['cash']['total'], current['expected_cash'], current['discounts']),
                         (3, 22800, 15800, 35800, 900))
        self.assertEqual(cashier.request('POST', '/api/admin/shifts/close', {'closing_cash': 35000, 'note': 'brak 8 zł'})[1]['difference'], -800)
        self.assertIsNone(cashier.request('GET', '/api/admin/shifts')[1]['current'])
        code, report = cashier.request('GET', '/api/admin/shifts/' + str(current['id']))
        self.assertEqual((code, len(report['sales']), report['status']), (200, 3, 'closed'))
        with api.connect() as c:
            detail = sales.details(c, sale['id'])
            self.assertEqual((detail['mode'], detail['payment_method'], detail['payment_status']), ('live', 'pos_cash', 'paid'))
            self.assertIn('paragon 2026/10/000123', detail['payment_note'])
        # Demo sales (prelaunch) still work without a shift and stay labelled as tests.
        with patch.dict(os.environ, {'ZASTAL_SALES_MODE': 'prelaunch'}):
            code, demo = self.admin.request('POST', '/api/admin/pos/sales', {**payload, 'idempotency_key': 'demo-pos-sale-key-00000001', 'fiscal': None, 'items': [{'id': 2, 'size': 'UNI', 'quantity': 1}]})
            self.assertEqual((code, demo.get('demo'), demo.get('status')), (201, True, 'wydane'), demo)


    # ------------------------------------------------------------ returns, complaints, cancellations
    def shipped_order(self, **extra):
        code, reply = self.order(**extra)
        self.assertEqual(code, 201, reply)
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm'})[0], 200)
        with api.connect() as c:
            c.execute("UPDATE orders SET status='spakowane' WHERE id=?", (reply['id'],))
            c.commit()
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/shipment", {'carrier': 'InPost', 'tracking_number': '620000012345'})[0], 200)
        return reply

    def test_customer_return_is_registered_accepted_and_settled_with_restock(self):
        self.go_live()
        reply = self.shipped_order()
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 2)
        bad = self.public('POST', f"/api/orders/{reply['id']}/returns", {'tracking_token': 'wrong', 'items': [{'line_index': 0, 'qty': 1}], 'reason': 'rozmiar'})
        self.assertEqual(bad[0], 404)
        code, created = self.public('POST', f"/api/orders/{reply['id']}/returns", {'tracking_token': reply['tracking_token'], 'kind': 'zwrot', 'items': [{'line_index': 0, 'qty': 1}], 'reason': 'rozmiar'})
        self.assertEqual((code, created['return']['status']), (201, 'zgloszony'), created)
        self.assertEqual(self.public('POST', f"/api/orders/{reply['id']}/returns", {'tracking_token': reply['tracking_token'], 'items': [{'line_index': 0, 'qty': 1}], 'reason': 'rozmiar'})[1]['code'], 'return_open')
        self.assertEqual(self.public('POST', f"/api/orders/{reply['id']}/returns", {'tracking_token': reply['tracking_token'], 'items': [{'line_index': 0, 'qty': 5}], 'reason': 'rozmiar'})[0], 400)
        code, receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")
        self.assertFalse(receipt['can_return'])
        self.assertEqual(receipt['returns'][0]['reason_label'], 'Zły rozmiar')
        self.assertNotIn('actor_id', receipt['returns'][0])
        code, listing = self.admin.request('GET', '/api/admin/returns')
        self.assertEqual((code, len(listing['returns']), listing['returns'][0]['customer_email']), (200, 1, 'kibic@example.test'))
        rid = listing['returns'][0]['id']
        code, accepted = self.admin.request('PATCH', f'/api/admin/returns/{rid}', {'status': 'przyjety', 'note': 'Odeślij InPostem'})
        self.assertEqual((code, accepted['status']), (200, 'przyjety'), accepted)
        self.assertEqual(self.admin.request('PATCH', f'/api/admin/returns/{rid}', {'status': 'rozliczony', 'refund_amount': 9399, 'refund_method': 'none'})[1]['code'], 'refund_method_required')
        code, settled = self.admin.request('PATCH', f'/api/admin/returns/{rid}', {'status': 'rozliczony', 'refund_amount': 9399, 'refund_method': 'transfer', 'restock': True})
        self.assertEqual((code, settled['status']), (200, 'rozliczony'), settled)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 3)
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply['id'],)).fetchone()[0], 'zwrot')
            self.assertEqual(sales.details(c, reply['id'])['payment_status'], 'refunded')
            kinds = [row[0] for row in c.execute("SELECT dedupe_key FROM email_outbox WHERE kind='return_update' ORDER BY id")]
            self.assertEqual(kinds, [f"return_update:{reply['id']}:{rid}:zgloszony", f"return_update:{reply['id']}:{rid}:przyjety", f"return_update:{reply['id']}:{rid}:rozliczony"])
            subject, body = sales.order_email(c, c.execute('SELECT * FROM orders WHERE id=?', (reply['id'],)).fetchone(), sales.details(c, reply['id']), 'return_update', 'https://store.example.test')
            self.assertIn('rozliczone', body)
            self.assertIn('93.99 PLN', body)
        self.assertEqual(self.admin.request('PATCH', f'/api/admin/returns/{rid}', {'status': 'przyjety'})[1]['code'], 'return_closed')
        self.assertEqual(self.admin.request('GET', '/api/admin/returns')[1]['returns'], [])
        self.assertEqual(len(self.admin.request('GET', '/api/admin/returns?all=1')[1]['returns']), 1)

    def test_staff_returns_refund_via_payu_or_open_cash_shift(self):
        self.go_live()
        code, reply = self.order(payment='payu')
        ext = json.loads(next(call for call in self.fake.calls if call[1].endswith('/api/v2_1/orders'))[3])['extOrderId']
        raw, header = signed({'order': {'orderId': 'PAYU-' + ext, 'extOrderId': ext, 'status': 'COMPLETED', 'totalAmount': '9399', 'currencyCode': 'PLN'}})
        self.assertEqual(self.public('POST', '/api/payments/payu/notify', raw, {'OpenPayu-Signature': header})[1]['result'], 'completed')
        with api.connect() as c:
            c.execute("UPDATE orders SET status='wydane' WHERE id=?", (reply['id'],))
            c.commit()
        code, created = self.admin.request('POST', '/api/admin/returns', {'order_id': reply['id'], 'kind': 'reklamacja', 'items': [{'line_index': 0, 'qty': 1}], 'reason': 'wada', 'description': 'Rozchodzący się szew'})
        self.assertEqual((code, created['source'], created['refund_amount']), (201, 'staff', 7900), created)
        code, settled = self.admin.request('PATCH', f"/api/admin/returns/{created['id']}", {'status': 'rozliczony', 'refund_amount': 7900, 'refund_method': 'payu', 'restock': False})
        self.assertEqual((code, settled['status']), (200, 'rozliczony'), settled)
        self.assertTrue(any('/refunds' in call[1] for call in self.fake.calls))
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT status,amount FROM payment_refunds").fetchone()[1], 7900)
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 2)
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply['id'],)).fetchone()[0], 'wydane')
        # Cash refund for a counter sale needs an open shift and lowers the expected cash.
        self.assertEqual(self.admin.request('POST', '/api/admin/shifts/open', {'opening_cash': 10000})[0], 201)
        code, sale = self.admin.request('POST', '/api/admin/pos/sales', {'items': [{'id': 2, 'size': 'UNI', 'quantity': 1}], 'idempotency_key': 'return-pos-sale-key-000001', 'payment_method': 'cash', 'payment_confirmed': True, 'fiscal': {'kind': 'paragon', 'number': '2026/10/5'}, 'handover': True})
        self.assertEqual(code, 201, sale)
        code, counter = self.admin.request('POST', '/api/admin/returns', {'order_id': sale['id'], 'kind': 'zwrot', 'items': [{'line_index': 0, 'qty': 1}], 'reason': 'odstapienie'})
        self.assertEqual(code, 201, counter)
        self.assertEqual(self.admin.request('POST', '/api/admin/shifts/close', {'closing_cash': 15000})[0], 200)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/returns/{counter['id']}", {'status': 'rozliczony', 'refund_amount': 5000, 'refund_method': 'cash'})[1]['code'], 'shift_required')
        self.assertEqual(self.admin.request('POST', '/api/admin/shifts/open', {'opening_cash': 15000})[0], 201)
        code, cash = self.admin.request('PATCH', f"/api/admin/returns/{counter['id']}", {'status': 'rozliczony', 'refund_amount': 5000, 'refund_method': 'cash'})
        self.assertEqual((code, cash['status']), (200, 'rozliczony'), cash)
        shift = self.admin.request('GET', '/api/admin/shifts')[1]['current']
        self.assertEqual((shift['cash_refunds'], shift['expected_cash']), (5000, 10000))
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='AC-UNI'").fetchone()[0], 10)
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (sale['id'],)).fetchone()[0], 'zwrot')

    def test_cancellation_after_personalization_needs_manager_override_and_writes_off_printed_units(self):
        self.go_live()
        with api.connect() as c:
            c.execute('INSERT INTO product_options(product_id,personalization_enabled,personalization_fee) VALUES(1,1,2500)')
            c.commit()
        code, reply = self.order(items=[{'id': 1, 'size': 'L', 'quantity': 1, 'personalization': {'mode': 'custom', 'name': 'Kibic', 'number': '7'}}, {'id': 2, 'size': 'UNI', 'quantity': 1}], shipping={'method': 'odbior'}, payment='pickup')
        self.assertEqual(code, 201, reply)
        with api.connect() as c:
            c.execute("UPDATE orders SET status='nanoszenie_dtf' WHERE id=?", (reply['id'],))
            c.execute('INSERT INTO fulfillment_lines(order_id,line_index,picked_qty,printed_qty) VALUES(?,0,1,1)', (reply['id'],))
            c.commit()
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/orders/{reply['id']}", {'status': 'anulowane'})[0], 400)
        self.assertEqual(self.admin.request('POST', '/api/admin/staff', {'identifier': 'kasa', 'name': 'Kasa', 'role': 'cashier', 'password': 'Staff member password 2026'})[0], 201)
        cashier = Client(self.port)
        cashier.login('kasa', 'Staff member password 2026')
        self.assertEqual(cashier.request('POST', f"/api/admin/orders/{reply['id']}/cancel", {'reason': 'klient zrezygnował'})[0], 403)
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/cancel", {'reason': ''})[0], 400)
        code, cancelled = self.admin.request('POST', f"/api/admin/orders/{reply['id']}/cancel", {'reason': 'klient zrezygnował po nadruku'})
        self.assertEqual((code, cancelled['status']), (200, 'anulowane'), cancelled)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='TS-L'").fetchone()[0], 2)
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='AC-UNI'").fetchone()[0], 10)
            self.assertTrue(c.execute("SELECT 1 FROM stock_events WHERE reason LIKE 'odpis 1 szt.%'").fetchone())
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?', (reply['id'],)).fetchone()[0], 'anulowane')
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/cancel", {'reason': 'x'})[1]['code'], 'order_closed')


if __name__ == '__main__':
    unittest.main()