"""Badges, releases, back-in-stock alerts and promo codes on top of the live-mode sales fixture."""
import datetime as dt
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import commerce_api as api
import commerce_auth as auth
import commerce_merch as merch
import commerce_payments as payments
from http_client import Client
import test_sales
from test_sales import ADMIN_PASSWORD, PAYU_ENV, FakePayU


class MerchTests(unittest.TestCase):
    public = test_sales.SalesTests.public
    go_live = test_sales.SalesTests.go_live
    order = test_sales.SalesTests.order

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'merch.sqlite3'
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

    def product(self, pid):
        return next(p for p in self.public('GET', '/api/catalog')[1] if p['id'] == pid)

    # ------------------------------------------------------------ badges
    def test_badges_come_from_data_unless_set_by_hand(self):
        self.assertIsNone(self.product(1)['badge_info'])
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'badge': 'limitowana'})[0], 200)
        self.assertEqual(self.product(1)['badge_info'], {'code': 'limitowana', 'label': 'Edycja limitowana'})
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'badge': 'wyprzedaz'})[1]['badge'], 'wyprzedaz')
        self.assertEqual(self.product(1)['badge_info']['label'], 'Wyprzedaż')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'badge': 'zloty'})[0], 400)
        # A real price reduction shows "Promocja" automatically; "none" silences every badge.
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'badge': '', 'price': 6900})[0], 200)
        self.assertEqual(self.product(1)['badge_info']['code'], 'promocja')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'badge': 'none'})[0], 200)
        self.assertIsNone(self.product(1)['badge_info'])
        # New products are "Nowość" for 30 days; products that predate the migration are not.
        code, created = self.admin.request('POST', '/api/admin/products', {'name': 'Czapka', 'sku': 'ZS-CAP-1', 'category': 'Akcesoria', 'price': 3900, 'stock': 5})
        self.assertEqual(code, 201, created)
        self.assertEqual(self.product(created['id'])['badge_info']['code'], 'nowosc')
        self.assertIsNone(self.product(2)['badge_info'])
        # Paid live sales make a bestseller.
        self.go_live()
        for key in ('best-1', 'best-2'):
            code, reply = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 2}], idempotency_key=f'live-order-key-{key:>08}')
            self.assertEqual(code, 201, reply)
            self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        self.assertEqual(self.product(2)['badge_info']['code'], 'bestseller')

    def test_release_blocks_online_checkout_until_the_announced_time(self):
        later = (dt.datetime.now(merch.LOCAL) + dt.timedelta(days=2)).strftime('%Y-%m-%dT%H:%M')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'release_at': '12.11.2026'})[0], 400)
        code, saved = self.admin.request('PATCH', '/api/admin/products/1', {'release_at': later})
        self.assertEqual(code, 200, saved)
        product = self.product(1)
        self.assertFalse(product['released'])
        self.assertEqual(product['badge_info']['code'], 'premiera')
        self.assertIsInstance(product['release_epoch'], int)
        self.go_live()
        code, reply = self.order()
        self.assertEqual(code, 400, reply)
        self.assertIn('premiera', reply['error'])
        earlier = (dt.datetime.now(merch.LOCAL) - dt.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'release_at': earlier})[0], 200)
        self.assertTrue(self.product(1)['released'])
        self.assertEqual(self.order()[0], 201)

    # ------------------------------------------------------------ stock alerts
    def test_back_in_stock_alert_is_queued_once_the_size_returns(self):
        variant = next(v for v in self.product(1)['variants'] if v['size'] == 'L')
        self.assertEqual(self.public('POST', '/api/stock-alerts', {'product_id': 1, 'size': 'L', 'email': 'kibic@example.test'})[0], 409)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/inventory/{variant['id']}", {'delta': -variant['stock'], 'reason': 'spis z natury'})[0], 200)
        self.assertEqual(self.public('POST', '/api/stock-alerts', {'product_id': 1, 'size': 'L', 'email': 'zly-adres'})[0], 400)
        code, reply = self.public('POST', '/api/stock-alerts', {'product_id': 1, 'size': 'L', 'email': 'Kibic@Example.test'})
        self.assertEqual((code, reply['ok']), (200, True), reply)
        self.assertEqual(self.public('POST', '/api/stock-alerts', {'product_id': 1, 'size': 'L', 'email': 'kibic@example.test'})[0], 200)
        pending = self.admin.request('GET', '/api/admin/stock-alerts')[1]
        self.assertEqual([(p['product_id'], p['size'], p['waiting']) for p in pending], [(1, 'L', 1)])
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM email_outbox WHERE kind='stock_alert'").fetchone()[0], 0)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/inventory/{variant['id']}", {'delta': 3, 'reason': 'dostawa'})[0], 200)
        with api.connect() as c:
            rows = c.execute("SELECT recipient,dedupe_key FROM email_outbox WHERE kind='stock_alert'").fetchall()
            self.assertEqual([tuple(row) for row in rows], [('kibic@example.test', 'stock_alert:1')])
            subject, body = merch.alert_message(c, 1, 'https://store.example.test')
            self.assertEqual(subject, 'Koszulka w rozmiarze L jest znów dostępny')
            self.assertIn('https://store.example.test/produkt/1', body)
        self.assertEqual(self.admin.request('GET', '/api/admin/stock-alerts')[1], [])
        self.assertEqual(self.admin.request('POST', '/api/admin/stock-alerts/notify')[1], {'queued': 0})

    # ------------------------------------------------------------ promo codes
    def test_free_shipping_threshold_counts_the_discounted_goods(self):
        self.assertEqual(self.admin.request('POST', '/api/admin/promo', {'code': 'KIBIC10', 'kind': 'percent', 'value': 10})[0], 201)
        self.go_live()
        kurier = next(m for m in self.admin.request('GET', '/api/admin/shipping')[1] if m['code'] == 'kurier')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/shipping/' + str(kurier['id']), {'free_from': 7500})[0], 200)
        # 79.00 PLN of goods clears the 75.00 PLN threshold on its own...
        code, reply = self.order()
        self.assertEqual((code, reply['total']), (201, 7900), reply)
        # ...but with 10% off the customer pays 71.10 PLN for the goods, so the courier is charged again.
        code, reply = self.order(promo_code='kibic10', idempotency_key='live-order-key-00000002')
        self.assertEqual((code, reply['total'], reply['discount']), (201, 7900 - 790 + 1499, 790), reply)

    def test_promo_codes_are_validated_applied_and_consumed(self):
        code, promo = self.admin.request('POST', '/api/admin/promo', {'code': 'kibic10', 'kind': 'percent', 'value': 10, 'min_subtotal': 5000, 'max_uses': 1})
        self.assertEqual(code, 201, promo)
        self.assertEqual(promo['code'], 'KIBIC10')
        self.assertEqual(self.admin.request('POST', '/api/admin/promo', {'code': 'KIBIC10', 'kind': 'percent', 'value': 5})[0], 409)
        self.assertEqual(self.admin.request('POST', '/api/admin/promo', {'code': 'ZA DUZO', 'kind': 'percent', 'value': 5})[0], 400)
        self.assertEqual(self.admin.request('POST', '/api/admin/promo', {'code': 'STO', 'kind': 'percent', 'value': 150})[0], 400)
        code, check = self.public('POST', '/api/promo/check', {'code': 'kibic10', 'subtotal': 7900})
        self.assertEqual((code, check['discount'], check['label']), (200, 790, '10%'), check)
        self.assertEqual(self.public('POST', '/api/promo/check', {'code': 'kibic10', 'subtotal': 3000})[1]['code'], 'promo_minimum')
        self.assertEqual(self.public('POST', '/api/promo/check', {'code': 'NIEMA', 'subtotal': 7900})[0], 400)
        self.go_live()
        code, reply = self.order(promo_code='kibic10')
        self.assertEqual(code, 201, reply)
        self.assertEqual((reply['total'], reply['discount'], reply['promo_code']), (7900 + 1499 - 790, 790, 'KIBIC10'))
        receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")[1]
        self.assertEqual((receipt['details']['promo_code'], receipt['details']['discount']), ('KIBIC10', 790))
        self.assertEqual(self.admin.request('GET', '/api/admin/promo')[1][0]['uses'], 1)
        # The single use is spent: the same code on a new order is refused, a different cart with the same key conflicts.
        self.assertEqual(self.public('POST', '/api/promo/check', {'code': 'KIBIC10', 'subtotal': 7900})[1]['code'], 'promo_exhausted')
        self.assertEqual(self.order(promo_code='kibic10', idempotency_key='live-order-key-00000002')[0], 400)
        self.assertEqual(self.order()[0], 409)
        # Amount codes, deactivation and e-mail wording.
        code, amount = self.admin.request('POST', '/api/admin/promo', {'code': 'MINUS20', 'kind': 'amount', 'value': 2000})
        self.assertEqual(code, 201, amount)
        code, reply = self.order(promo_code='minus20', idempotency_key='live-order-key-00000003')
        self.assertEqual((code, reply['total']), (201, 7900 + 1499 - 2000), reply)
        with api.connect() as c:
            import commerce_sales as sales
            subject, body = sales.order_email(c, c.execute('SELECT * FROM orders WHERE id=?', (reply['id'],)).fetchone(), sales.details(c, reply['id']), 'order_created', 'https://store.example.test')
            self.assertIn('Rabat (MINUS20): -20.00 PLN', body)
            self.assertIn('Razem do zapłaty: 73.99 PLN', body)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/promo/{amount['id']}", {'active': False})[1]['active'], 0)
        self.assertEqual(self.public('POST', '/api/promo/check', {'code': 'MINUS20', 'subtotal': 7900})[0], 400)


if __name__ == '__main__':
    unittest.main()
