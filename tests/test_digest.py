"""Daily staff digest and the customer status e-mails around pickup and handover."""
import datetime as dt
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import commerce_api as api
import commerce_auth as auth
import commerce_digest as digest
import commerce_payments as payments
import commerce_sales as sales
from http_client import Client
import test_sales
from test_sales import ADMIN_PASSWORD, PAYU_ENV, FakePayU


class DigestTests(unittest.TestCase):
    public = test_sales.SalesTests.public
    go_live = test_sales.SalesTests.go_live
    order = test_sales.SalesTests.order

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'digest.sqlite3'
        api.TOKEN = ADMIN_PASSWORD
        api.LIMITS.clear()
        auth.clear_limits()
        payments.clear_token_cache()
        self.env = patch.dict(os.environ, {**PAYU_ENV, 'ZASTAL_SALES_MODE': 'live'})
        self.env.start()
        os.environ.pop('ZASTAL_TEST_MODE', None)
        self.transport = patch.object(payments, 'TRANSPORT', FakePayU())
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

    def outbox(self, kind=None):
        with api.connect() as c:
            rows = c.execute('SELECT kind,recipient,dedupe_key FROM email_outbox' + (' WHERE kind=?' if kind else '') + ' ORDER BY id', (kind,) if kind else ()).fetchall()
            return [tuple(row) for row in rows]

    def test_digest_lists_work_for_today_and_is_sent_once_a_day(self):
        self.go_live()
        # Unpaid for two days, one paid order to fulfil, a size running out and a sold-out size with a waiting customer.
        code, unpaid = self.order()
        self.assertEqual(code, 201, unpaid)
        with api.connect() as c:
            old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat(timespec='seconds')
            c.execute('UPDATE orders SET created=? WHERE id=?', (old, unpaid['id']))
        code, paid = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 1}], idempotency_key='live-order-key-00000002')
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{paid['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        variants = next(p for p in self.public('GET', '/api/catalog')[1] if p['id'] == 1)['variants']
        low, out = next(v for v in variants if v['size'] == 'M'), next(v for v in variants if v['size'] == 'XL')
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/inventory/{low['id']}", {'delta': -(low['stock'] - 2), 'reason': 'spis z natury'})[0], 200)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/inventory/{out['id']}", {'delta': -out['stock'], 'reason': 'spis z natury'})[0], 200)
        self.assertEqual(self.public('POST', '/api/stock-alerts', {'product_id': 1, 'size': 'XL', 'email': 'kibic@example.test'})[0], 200)
        code, data = self.admin.request('GET', '/api/admin/digest')
        self.assertEqual(code, 200, data)
        self.assertEqual([o['id'] for o in data['to_fulfil']], [paid['id']])
        self.assertEqual([o['id'] for o in data['unpaid']], [unpaid['id']])
        self.assertEqual((data['low_stock'][0]['size'], data['low_stock'][0]['stock']), ('M', 2))
        self.assertNotIn('XL', [v['size'] for v in data['low_stock']])
        self.assertEqual([(v['size'], v['waiting']) for v in data['sold_out']], [('XL', 1)])
        self.assertIn('Koszulka', [p['name'] for p in data['stale']])
        self.assertNotIn('Worek', [p['name'] for p in data['stale']])
        self.assertEqual(data['summary']['waiting'], 1)
        # Nothing goes out until the digest is enabled and has an address; then once per day.
        self.assertEqual(self.admin.request('POST', '/api/admin/digest/send')[0], 400)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/settings', {'digest_enabled': True, 'digest_email': 'Sklep@Example.test'})[0], 200)
        code, sent = self.admin.request('POST', '/api/admin/digest/send')
        self.assertEqual((code, sent['recipient']), (200, 'sklep@example.test'), sent)
        self.assertEqual(self.outbox('staff_digest'), [('staff_digest', 'sklep@example.test', 'staff_digest:' + data['date'])])
        with api.connect() as c:
            self.assertEqual(digest.send_daily(c), '')  # already sent today
            tomorrow = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)
            tomorrow = tomorrow.replace(hour=9)
            self.assertEqual(digest.send_daily(c, tomorrow), 'sklep@example.test')
            self.assertEqual(digest.send_daily(c, tomorrow.replace(hour=5) + dt.timedelta(days=1)), '')  # before 07:00
            subject, body = digest.message(c, data['date'], 'https://store.example.test')
            self.assertIn('podsumowanie dnia', subject)
            self.assertIn(f"ZS-{paid['id']:05d}", body)
            self.assertIn('Koszulka / M · 2 szt.', body)
            self.assertIn('Koszulka / XL · czeka 1', body)
            self.assertIn('BEZ PŁATNOŚCI PONAD 24 H: 1', body)
        self.assertEqual(len(self.outbox('staff_digest')), 2)

    def test_customers_get_pickup_ready_and_handover_mails_but_not_workflow_noise(self):
        self.go_live()
        code, reply = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 1}], shipping={'method': 'odbior'}, fulfillment='odbior', payment='transfer')
        self.assertEqual((code, reply['status']), (201, 'oczekuje_platnosci'), reply)
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        before = len(self.outbox())
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/orders/{reply['id']}", {'status': 'do_kompletacji'})[0], 200)
        self.assertEqual(len(self.outbox()), before)  # workflow step: no customer e-mail
        detail = self.admin.request('GET', f"/api/admin/fulfillment/{reply['id']}")[1]
        line = detail['items'][0]
        for action in ('pick', 'check'):
            code, detail = self.admin.request('PATCH', f"/api/admin/fulfillment/{reply['id']}", {'action': action, 'line_index': line['line_index'], 'quantity': 1, 'code': line['variant_sku'], 'revision': detail['revision']})
            self.assertEqual(code, 200, detail)
        code, detail = self.admin.request('POST', f"/api/admin/fulfillment/{reply['id']}/complete", {'action': 'pack', 'revision': detail['revision']})
        self.assertEqual((code, detail['status']), (200, 'spakowane'), detail)
        self.assertEqual(self.outbox()[-1][0], 'order_status_changed')
        with api.connect() as c:
            order = c.execute('SELECT * FROM orders WHERE id=?', (reply['id'],)).fetchone()
            subject, body = sales.order_email(c, order, sales.details(c, reply['id']), 'order_status_changed', 'https://store.example.test')
            self.assertIn('czeka na odbiór', subject)
            self.assertIn('Sulechowska', body)
            self.assertNotIn('Przy odbiorze zapłacisz', body)
        code, detail = self.admin.request('POST', f"/api/admin/fulfillment/{reply['id']}/complete", {'action': 'handover', 'revision': detail['revision']})
        self.assertEqual((code, detail['status']), (200, 'wydane'), detail)
        with api.connect() as c:
            order = c.execute('SELECT * FROM orders WHERE id=?', (reply['id'],)).fetchone()
            subject, _ = sales.order_email(c, order, sales.details(c, reply['id']), 'order_status_changed', 'https://store.example.test')
            self.assertIn('odebrane', subject)
        # Courier orders are silent when packed and speak when shipped.
        code, courier = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 1}], idempotency_key='live-order-key-00000003')
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{courier['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        with api.connect() as c:
            c.execute("UPDATE orders SET status='spakowane' WHERE id=?", (courier['id'],))
            import commerce_email as mail
            self.assertIsNone(mail.enqueue_order(c, courier['id'], 'order_status_changed'))
            c.execute("UPDATE orders SET status='wyslane' WHERE id=?", (courier['id'],))
            self.assertIsNotNone(mail.enqueue_order(c, courier['id'], 'order_status_changed'))


if __name__ == '__main__':
    unittest.main()
