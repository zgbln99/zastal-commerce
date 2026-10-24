"""Sales reports: real sales only, by day, channel, payment and product, with CSV export."""
import datetime as dt
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import commerce_api as api
import commerce_auth as auth
import commerce_payments as payments
import commerce_reports as reports
from http_client import Client
import test_sales
from test_sales import ADMIN_PASSWORD, PAYU_ENV, FakePayU


class ReportTests(unittest.TestCase):
    public = test_sales.SalesTests.public
    go_live = test_sales.SalesTests.go_live
    order = test_sales.SalesTests.order

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'reports.sqlite3'
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

    def raw(self, path):
        import urllib.request
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}' + path, headers={'Cookie': self.admin.cookie})
        with urllib.request.urlopen(request, timeout=8) as response:
            self.assertEqual(response.headers['Content-Type'], 'text/csv; charset=utf-8')
            self.assertIn('attachment', response.headers['Content-Disposition'])
            return response.read().decode('utf-8')

    def test_report_counts_paid_live_orders_and_real_pos_sales_only(self):
        today = dt.datetime.now(reports.LOCAL).strftime('%Y-%m-%d')
        # A demo POS sale before launch never shows up in the live report.
        self.assertEqual(self.admin.request('POST', '/api/admin/pos/sales', {'items': [{'id': 2, 'size': 'UNI', 'quantity': 1}], 'idempotency_key': 'pos-demo-sale-key-000001', 'payment_method': 'cash', 'payment_confirmed': True, 'handover': True})[0], 201)
        self.go_live()
        code, unpaid = self.order()
        self.assertEqual(code, 201, unpaid)
        code, paid = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 2}], idempotency_key='live-order-key-00000002')
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{paid['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        self.assertEqual(self.admin.request('POST', '/api/admin/shifts/open', {'opening_cash': 10000})[0], 201)
        code, sale = self.admin.request('POST', '/api/admin/pos/sales', {'items': [{'id': 1, 'size': 'L', 'quantity': 1}], 'idempotency_key': 'live-pos-sale-key-000001', 'payment_method': 'terminal', 'payment_confirmed': True, 'fiscal': {'kind': 'paragon', 'number': '2026/10/000001'}, 'handover': True})
        self.assertEqual(code, 201, sale)
        code, report = self.admin.request('GET', f'/api/admin/reports/sales?from={today}&to={today}')
        self.assertEqual(code, 200, report)
        self.assertEqual((report['totals']['orders'], report['totals']['revenue']), (2, 2 * 5000 + 1499 + 7900))
        self.assertEqual(report['by_channel'], {'online': {'orders': 1, 'revenue': 11499}, 'pos': {'orders': 1, 'revenue': 7900}})
        self.assertEqual([(p['sku'], p['qty'], p['revenue']) for p in report['by_product']], [('AC', 2, 10000), ('TS', 1, 7900)])
        self.assertEqual([(p['label'], p['orders']) for p in report['by_payment']], [('Kasa: terminal', 1), ('Przelew', 1)])
        self.assertEqual(report['by_day'][0]['day'], today)
        self.assertEqual(report['refunds'], {'count': 0, 'amount': 0})
        self.assertEqual(self.admin.request('GET', '/api/admin/reports/sales?from=2026-13-01')[0], 400)
        test_scope = self.admin.request('GET', f'/api/admin/reports/sales?from={today}&to={today}&scope=test')[1]
        self.assertEqual((test_scope['totals']['orders'], test_scope['by_channel']['pos']['revenue']), (1, 5000))
        csv_text = self.raw(f'/api/admin/reports/sales.csv?from={today}&to={today}&by=product')
        self.assertTrue(csv_text.startswith('﻿SKU;Produkt;Sztuk;Wartość PLN'), csv_text[:60])
        self.assertIn('AC;Worek;2;100,00', csv_text)
        days_csv = self.raw(f'/api/admin/reports/sales.csv?from={today}&to={today}')
        self.assertIn(f'{today};2;114,99;79,00;193,99', days_csv)


if __name__ == '__main__':
    unittest.main()
