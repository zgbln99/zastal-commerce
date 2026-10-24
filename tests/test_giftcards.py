"""Gift cards: staff issue, online purchase as a digital product, redemption online and at the POS."""
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import commerce_api as api
import commerce_auth as auth
import commerce_giftcards as giftcards
import commerce_payments as payments
from http_client import Client
import test_sales
from test_sales import ADMIN_PASSWORD, PAYU_ENV, FakePayU


class GiftCardTests(unittest.TestCase):
    public = test_sales.SalesTests.public
    go_live = test_sales.SalesTests.go_live
    order = test_sales.SalesTests.order

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'gift.sqlite3'
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

    def outbox(self, kind):
        with api.connect() as c:
            return [tuple(row) for row in c.execute('SELECT recipient,dedupe_key FROM email_outbox WHERE kind=? ORDER BY id', (kind,))]

    def test_staff_issue_balance_check_and_online_redemption_with_release_on_cancel(self):
        code, card = self.admin.request('POST', '/api/admin/giftcards', {'value': 10000, 'recipient_email': 'Obdarowany@Example.test', 'message': 'Sto lat!', 'send_email': True, 'note': 'sprzedana przy stoisku'})
        self.assertEqual(code, 201, card)
        self.assertTrue(giftcards.CODE.fullmatch(card['code']), card['code'])
        self.assertEqual((card['balance'], card['state'], card['recipient_email']), (10000, 'active', 'obdarowany@example.test'))
        self.assertEqual(self.outbox('gift_card_issued'), [('obdarowany@example.test', f'gift_card:{card["id"]}')])
        self.assertEqual(self.admin.request('POST', '/api/admin/giftcards', {'value': 500})[0], 400)
        self.assertEqual(self.admin.request('POST', '/api/admin/giftcards', {'value': 5000, 'expires_at': '2020-01-01'})[0], 400)
        # Public balance check accepts loose formatting and never needs an account.
        loose = card['code'].lower().replace('-', ' ')
        code, view = self.public('POST', '/api/giftcards/check', {'code': loose})
        self.assertEqual((code, view['balance'], view['state']), (200, 10000, 'active'), view)
        self.assertEqual(self.public('POST', '/api/giftcards/check', {'code': 'ZG-AAAA-AAAA-AAAA'})[0], 404)
        self.assertEqual(self.public('POST', '/api/giftcards/check', {'code': 'nope'})[0], 400)
        self.go_live()
        # Partial payment: 2 x Worek + courier = 114.99, card covers 100.00, the rest waits for a transfer.
        code, reply = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 2}], gift_card=card['code'])
        self.assertEqual(code, 201, reply)
        self.assertEqual((reply['total'], reply['gift_card_amount'], reply['status']), (1499, 10000, 'oczekuje_platnosci'))
        self.assertEqual(self.public('POST', '/api/giftcards/check', {'code': card['code']})[1]['balance'], 0)
        receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")[1]
        self.assertEqual((receipt['details']['gift_card_amount'], receipt['details']['gift_card_code']), (10000, 'ZG-••••-••••-' + card['code'][-4:]))
        # An exhausted card is refused; cancelling the order gives the money back.
        self.assertEqual(self.order(items=[{'id': 1, 'size': 'L', 'quantity': 1}], gift_card=card['code'], idempotency_key='live-order-key-00000002')[0], 400)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/orders/{reply['id']}", {'status': 'anulowane'})[0], 200)
        detail = self.admin.request('GET', f"/api/admin/giftcards/{card['id']}")[1]
        self.assertEqual((detail['balance'], [t['kind'] for t in detail['transactions']]), (10000, ['issue', 'redeem', 'release']))
        # Repeating the cancellation is harmless: nothing is released twice.
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/orders/{reply['id']}", {'status': 'anulowane'})[0], 200)
        self.assertEqual(self.admin.request('GET', f"/api/admin/giftcards/{card['id']}")[1]['balance'], 10000)
        # Full coverage: the order is paid at once without any payment operator.
        code, paid = self.order(items=[{'id': 1, 'size': 'L', 'quantity': 1}], gift_card=card['code'], payment='payu', idempotency_key='live-order-key-00000003')
        self.assertEqual(code, 201, paid)
        self.assertEqual((paid['total'], paid['gift_card_amount'], paid['status']), (0, 7900 + 1499, 'oplacone'))
        self.assertEqual(paid['payment'], {'method': 'giftcard', 'status': 'paid'})
        receipt = self.public('GET', f"/api/orders/{paid['id']}?token={paid['tracking_token']}")[1]
        self.assertEqual((receipt['details']['payment_method'], receipt['details']['payment_status']), ('giftcard', 'paid'))
        self.assertEqual([o['id'] for o in self.admin.request('GET', '/api/admin/fulfillment')[1]], [paid['id']])
        self.assertEqual(self.public('POST', '/api/giftcards/check', {'code': card['code']})[1]['balance'], 10000 - 9399)
        # Blocking.
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/giftcards/{card['id']}", {'status': 'blocked', 'note': 'zgłoszenie kradzieży'})[1]['state'], 'blocked')
        self.assertEqual(self.public('POST', '/api/giftcards/check', {'code': card['code']})[1]['state'], 'blocked')
        self.assertEqual(self.admin.request('GET', '/api/admin/giftcards')[1][0]['note'], 'zgłoszenie kradzieży')

    def test_gift_card_product_is_digital_and_cards_are_issued_when_paid(self):
        code, product = self.admin.request('POST', '/api/admin/products', {'name': 'Karta podarunkowa 100 zł', 'sku': 'ZS-GIFT-100', 'category': 'Akcesoria', 'price': 10000, 'stock': 0, 'gift_card': True})
        self.assertEqual(code, 201, product)
        self.assertTrue(product['gift_card'])
        listing = next(p for p in self.public('GET', '/api/catalog')[1] if p['id'] == product['id'])
        self.assertEqual(listing['variants'][0]['stock'], 9999)
        self.go_live()
        self.assertEqual(self.order(items=[{'id': product['id'], 'size': 'UNI', 'quantity': 2}], shipping={'method': 'kurier'}, fulfillment='kurier')[0], 400)
        code, reply = self.order(items=[{'id': product['id'], 'size': 'UNI', 'quantity': 2}], shipping={'method': 'email'}, fulfillment='email',
                                 gift={'email': 'Dziadek@example.test', 'message': 'Na urodziny'}, idempotency_key='live-order-key-00000011')
        self.assertEqual(code, 201, reply)
        self.assertEqual((reply['total'], reply['status']), (20000, 'oczekuje_platnosci'))
        self.assertEqual(self.order(items=[{'id': product['id'], 'size': 'UNI', 'quantity': 1}], shipping={'method': 'email'}, fulfillment='email', payment='pickup', idempotency_key='live-order-key-00000012')[0], 400)
        self.assertEqual(self.outbox('gift_card_issued'), [])
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        receipt = self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")[1]
        self.assertEqual(receipt['status'], 'wydane')
        self.assertEqual(len(receipt['gift_cards']), 2)
        self.assertEqual({card['balance'] for card in receipt['gift_cards']}, {10000})
        self.assertEqual([r for r, _ in self.outbox('gift_card_issued')], ['dziadek@example.test', 'dziadek@example.test'])
        with api.connect() as c:
            subject, body = giftcards.card_message(c, 1, 'https://store.example.test')
            self.assertIn('100.00 PLN', subject)
            self.assertIn(receipt['gift_cards'][0]['code'], body)
            self.assertIn('Na urodziny', body)
        self.assertEqual([o['id'] for o in self.admin.request('GET', '/api/admin/fulfillment')[1]], [])
        # Stock of the physical catalogue is untouched and the bought card works right away.
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm', 'note': 'ponownie'})[0], 200)
        self.assertEqual(len(self.public('GET', f"/api/orders/{reply['id']}?token={reply['tracking_token']}")[1]['gift_cards']), 2)
        code, use = self.order(items=[{'id': 2, 'size': 'UNI', 'quantity': 1}], gift_card=receipt['gift_cards'][0]['code'], idempotency_key='live-order-key-00000013')
        self.assertEqual((code, use['total'], use['status']), (201, 0, 'oplacone'), use)

    def test_pos_redeems_cards_only_on_live_sales_and_the_shift_report_subtracts_them(self):
        card = self.admin.request('POST', '/api/admin/giftcards', {'value': 3000})[1]
        payload = {'items': [{'id': 2, 'size': 'UNI', 'quantity': 1}], 'idempotency_key': 'live-pos-sale-key-000101', 'payment_method': 'cash',
                   'payment_confirmed': True, 'fiscal': {'kind': 'paragon', 'number': '2026/10/000777'}, 'cash_received': 2000, 'handover': True, 'gift_card': card['code']}
        self.assertEqual(self.admin.request('POST', '/api/admin/pos/sales', payload)[1]['code'], 'gift_card_live_only')
        self.go_live()
        self.assertEqual(self.admin.request('POST', '/api/admin/shifts/open', {'opening_cash': 10000})[0], 201)
        code, sale = self.admin.request('POST', '/api/admin/pos/sales', payload)
        self.assertEqual(code, 201, sale)
        self.assertEqual((sale['total'], sale['gift_card_amount'], sale['due'], sale['change_due']), (5000, 3000, 2000, 0))
        self.assertEqual(self.public('POST', '/api/giftcards/check', {'code': card['code']})[1]['state'], 'used')
        self.assertEqual(self.admin.request('POST', '/api/admin/pos/sales', {**payload, 'idempotency_key': 'live-pos-sale-key-000102'})[1]['code'], 'gift_card_used')
        summary = self.admin.request('GET', '/api/admin/shifts')[1]['current']
        self.assertEqual((summary['by_method']['cash']['total'], summary['gift_card_cash'], summary['expected_cash']), (5000, 3000, 12000))


if __name__ == '__main__':
    unittest.main()
