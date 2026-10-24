"""Omnibus price history and order lookup on isolated databases."""
import datetime as dt
import tempfile
import threading
import unittest
from pathlib import Path
import commerce_api as api
import commerce_auth as auth
import commerce_pricing as pricing
from http_client import Client

ADMIN_PASSWORD = 'Fixture admin password 2026'


class PricingTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'pricing.sqlite3'
        api.TOKEN = ADMIN_PASSWORD
        api.LIMITS.clear()
        auth.clear_limits()
        api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products VALUES(1,'Koszulka','TS','Koszulki',7900,15)")
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.port = self.server.server_address[1]
        self.admin = Client(self.port)
        self.assertEqual(self.admin.login('admin', ADMIN_PASSWORD)[0], 200)
        self.guest = Client(self.port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def test_price_reduction_exposes_lowest_price_from_30_days_before(self):
        self.assertIsNone(self.guest.request('GET', '/api/catalog/1')[1]['price_reduction'])
        now = dt.datetime.now(dt.timezone.utc)
        with api.connect() as c:
            # 45 days ago 79.00 (seed), 20 days ago 69.00, 10 days ago 89.00, today reduced to 59.00
            c.execute('UPDATE product_prices SET changed_at=? WHERE product_id=1', (pricing.stamp(now - dt.timedelta(days=45)),))
            pricing.record(c, 1, 6900, moment=now - dt.timedelta(days=20))
            pricing.record(c, 1, 8900, moment=now - dt.timedelta(days=10))
            c.execute('UPDATE products SET price=8900 WHERE id=1')
            c.commit()
        code, product = self.admin.request('PATCH', '/api/admin/products/1', {'price': 5900})
        self.assertEqual(code, 200, product)
        reduction = product['price_reduction']
        self.assertEqual((reduction['previous'], reduction['lowest_30d']), (8900, 6900))
        self.assertEqual(self.guest.request('GET', '/api/catalog/1')[1]['price_reduction']['lowest_30d'], 6900)
        code, history = self.admin.request('GET', '/api/admin/products/1/prices')
        self.assertEqual([row['price'] for row in history['history']], [5900, 8900, 6900, 7900])
        # Raising the price removes the reduction notice; unchanged saves add no history rows.
        self.admin.request('PATCH', '/api/admin/products/1', {'price': 9900})
        self.assertIsNone(self.guest.request('GET', '/api/catalog/1')[1]['price_reduction'])
        self.admin.request('PATCH', '/api/admin/products/1', {'name': 'Koszulka klubowa'})
        self.assertEqual(len(self.admin.request('GET', '/api/admin/products/1/prices')[1]['history']), 5)
        with api.connect() as c:
            self.assertTrue(c.execute("SELECT 1 FROM audit_log WHERE note LIKE 'Zmieniono cenę z 89.00 na 59.00%'").fetchone())
            # A reduction older than 30 days is no longer announced.
            c.execute('UPDATE products SET price=5000 WHERE id=1')
            pricing.record(c, 1, 5000, moment=now - dt.timedelta(days=31))
            c.commit()
        self.assertIsNone(self.guest.request('GET', '/api/catalog/1')[1]['price_reduction'])

    def test_order_lookup_resends_link_only_to_matching_email_without_leaking(self):
        self.assertEqual(self.guest.request('POST', '/api/orders/lookup', {'order': 'ZS-00001', 'email': 'nobody@example.test'})[0], 200)
        self.assertEqual(self.guest.request('POST', '/api/orders/lookup', {'order': 'abc', 'email': 'x@y.test'})[0], 400)
        customer = Client(self.port)
        self.assertEqual(customer.register('kibic@example.test')[0], 201)
        code, order = customer.request('POST', '/api/orders', {'items': [{'id': 1, 'size': 'L', 'quantity': 1}], 'fulfillment': 'odbior'})
        self.assertEqual(code, 201, order)
        with api.connect() as c:
            before = c.execute("SELECT COUNT(*) FROM email_outbox WHERE kind='order_created'").fetchone()[0]
            c.execute("UPDATE email_outbox SET status='sent'")
            c.commit()
        self.assertEqual(self.guest.request('POST', '/api/orders/lookup', {'order': f"zs-{order['id']}", 'email': 'other@example.test'})[0], 200)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT status FROM email_outbox WHERE kind='order_created'").fetchone()[0], 'sent')
        self.assertEqual(self.guest.request('POST', '/api/orders/lookup', {'order': f"ZS-{order['id']:05d}", 'email': 'Kibic@Example.test'})[0], 200)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM email_outbox WHERE kind='order_created'").fetchone()[0], before)
            self.assertEqual(c.execute("SELECT status FROM email_outbox WHERE kind='order_created'").fetchone()[0], 'pending')


if __name__ == '__main__':
    unittest.main()
