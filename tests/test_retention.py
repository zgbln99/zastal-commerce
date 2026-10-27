"""Favourites on the account, price-drop alerts and abandoned-cart reminders on top of the live-mode merch fixture."""
import datetime as dt
import unittest

import commerce_api as api
import commerce_retention as retention
import test_merch
from http_client import Client


class RetentionTests(test_merch.MerchTests):
    def outbox(self, kind):
        with api.connect() as c:
            return [tuple(row) for row in c.execute('SELECT recipient,dedupe_key FROM email_outbox WHERE kind=? ORDER BY id', (kind,))]

    def test_favorites_merge_with_the_account_and_follow_replacements(self):
        customer = Client(self.port)
        self.assertEqual(customer.register('fan@example.test')[0], 201)
        self.assertEqual(self.public('GET', '/api/account/favorites')[0], 401)
        # First sync after login: the browser list joins what the account already holds; unknown products are dropped.
        code, merged = customer.request('POST', '/api/account/favorites', {'ids': [2, 99]})
        self.assertEqual((code, merged['ids']), (200, [2]))
        code, merged = customer.request('POST', '/api/account/favorites', {'ids': [1]})
        self.assertEqual((code, merged['ids']), (200, [2, 1]))
        # Later saves replace the list (a heart removed in the browser disappears from the account).
        code, merged = customer.request('POST', '/api/account/favorites', {'ids': [1], 'replace': True})
        self.assertEqual((code, merged['ids']), (200, [1]))
        self.assertEqual(customer.request('GET', '/api/account/favorites')[1]['ids'], [1])
        self.assertEqual(customer.request('POST', '/api/account/favorites', {'ids': 'x'})[0], 400)

    def test_price_alert_goes_out_once_the_price_drops(self):
        self.assertEqual(self.public('POST', '/api/price-alerts', {'product_id': 1, 'email': 'zly'})[0], 400)
        self.assertEqual(self.public('POST', '/api/price-alerts', {'product_id': 404, 'email': 'fan@example.test'})[0], 404)
        self.assertEqual(self.public('POST', '/api/price-alerts', {'product_id': 1, 'email': 'fan@example.test', 'website': 'spam'})[1], {'ok': True})
        code, reply = self.public('POST', '/api/price-alerts', {'product_id': 1, 'email': 'Fan@Example.test'})
        self.assertEqual((code, reply['ok']), (200, True), reply)
        code, pending = self.admin.request('GET', '/api/admin/price-alerts')
        self.assertEqual((code, pending[0]['waiting'], pending[0]['lowest_seen']), (200, 1, 7900))
        with api.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.assertEqual(retention.notify_price_drops(c), 0)  # same price: nothing to say
            c.commit()
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'price': 8900})[0], 200)  # dearer: still nothing
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'price': 6900})[0], 200)
        with api.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.assertEqual(retention.notify_price_drops(c), 1)
            self.assertEqual(retention.notify_price_drops(c), 0)  # one message per subscription
            subject, body = retention.price_alert_message(c, 1, 'https://sklep.test')
            c.commit()
        self.assertEqual(self.outbox('price_alert'), [('fan@example.test', 'price_alert:1')])
        self.assertIn('69.00 PLN zamiast 79.00 PLN', body)
        self.assertIn('https://sklep.test/produkt/koszulka', body)
        self.assertEqual(self.admin.request('GET', '/api/admin/price-alerts')[1], [])

    def test_cart_reminder_needs_consent_and_stops_after_an_order(self):
        items = [{'id': 1, 'size': 'L', 'quantity': 1}, {'id': 2, 'size': 'UNI', 'quantity': 2}]
        # No consent and no confirmed newsletter subscription: nothing is stored.
        code, reply = self.public('POST', '/api/cart/draft', {'email': 'fan@example.test', 'items': items})
        self.assertEqual((code, reply['stored']), (200, False))
        self.assertEqual(self.public('POST', '/api/cart/draft', {'email': 'fan@example.test', 'items': [], 'consent': True})[0], 400)
        code, reply = self.public('POST', '/api/cart/draft', {'email': 'Fan@example.test', 'items': items, 'consent': True})
        self.assertEqual((code, reply['stored']), (200, True))
        with api.connect() as c:
            token = c.execute("SELECT token FROM cart_drafts WHERE email='fan@example.test'").fetchone()[0]
            c.execute('BEGIN IMMEDIATE')
            self.assertEqual(retention.remind_abandoned(c), 0)  # too fresh
            c.execute("UPDATE cart_drafts SET updated=?", ((dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=25)).isoformat(timespec='seconds'),))
            self.assertEqual(retention.remind_abandoned(c), 1)
            self.assertEqual(retention.remind_abandoned(c), 0)
            subject, body = retention.reminder_message(c, 1, 'https://sklep.test')
            c.commit()
        self.assertEqual(self.outbox('cart_reminder'), [('fan@example.test', 'cart_reminder:1')])
        self.assertIn('Koszulka, rozmiar L', body)
        self.assertIn('Worek, 2 szt.', body)
        self.assertIn(f'https://sklep.test/koszyk?przywroc={token}', body)
        code, restored = self.public('GET', f'/api/cart/draft/{token}')
        self.assertEqual((code, restored['items']), (200, items))
        self.assertEqual(self.public('GET', '/api/cart/draft/' + 'x' * 24)[0], 404)
        # A new draft after the reminder, then an order with that address: converted, no second reminder.
        self.assertEqual(self.public('POST', '/api/cart/draft', {'email': 'fan@example.test', 'items': items[:1], 'consent': True})[1]['stored'], True)
        self.go_live()
        code, order = self.order(customer={'email': 'fan@example.test', 'name': 'Jan Kibic', 'phone': '600 100 200'})
        self.assertEqual(code, 201, order)
        with api.connect() as c:
            self.assertIsNotNone(c.execute("SELECT converted_at FROM cart_drafts WHERE email='fan@example.test'").fetchone()[0])
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE cart_drafts SET updated=?", ((dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=30)).isoformat(timespec='seconds'),))
            self.assertEqual(retention.remind_abandoned(c), 0)
            c.commit()


if __name__ == '__main__':
    unittest.main()
