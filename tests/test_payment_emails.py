import sqlite3
import unittest
from unittest.mock import patch
import commerce_sales as sales
import commerce_payments as payments
import commerce_email as mail


class PaymentEmailTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(':memory:')
        self.c.row_factory = sqlite3.Row
        self.order = {'id': 42, 'status': 'oczekuje_platnosci', 'total': 12900, 'items': '[]'}
        self.detail = {'mode': 'live', 'payment_status': 'failed', 'payment_method': 'payu',
                       'shipping_name': 'DPD', 'shipping_code': 'dpd', 'discount': 0,
                       'gift_card_amount': 0}
        self.c.execute('CREATE TABLE payments(id INTEGER PRIMARY KEY, order_id INTEGER, ext_order_id TEXT, status TEXT)')
        self.c.execute('CREATE TABLE payment_refunds(id INTEGER PRIMARY KEY, payment_id INTEGER, provider_refund_id TEXT, amount INTEGER, status TEXT)')
        self.c.execute("INSERT INTO payments VALUES(1,42,'attempt-1','rejected')")

    def test_failure_explains_retry_without_claiming_money_was_taken(self):
        subject, body = sales.order_email(self.c, self.order, self.detail, 'payment_failed', 'https://store.example.test')
        self.assertIn('nie powiodła', subject)
        self.assertIn('ponowić', body)
        self.assertIn('129.00 PLN', body)
        self.assertNotIn('Otrzymaliśmy płatność', body)

    def test_refund_messages_use_real_amount_and_distinguish_requested_from_final(self):
        self.c.execute("INSERT INTO payment_refunds VALUES(7,1,'refund-7',4900,'pending')")
        self.detail['payment_status'] = 'paid'
        for kind, phrase in [('refund_requested', 'Zleciliśmy'), ('refund_completed', 'Zwrócono')]:
            subject, body = sales.order_email(self.c, self.order, self.detail, kind, 'https://store.example.test', event_id=7)
            self.assertIn(phrase, body)
            self.assertIn('49.00 PLN', body)
            self.assertIn('ZS-00042', body)

    def test_manual_partial_refund_uses_actual_amount(self):
        self.detail['payment_status'] = 'partially_refunded'
        subject, body = sales.order_email(self.c, self.order, self.detail, 'refund_completed',
                                          'https://store.example.test', event_amount=4900)
        self.assertIn('49.00 PLN', body)
        self.assertNotIn('129.00 PLN za zamówienie', body)

    def test_payment_mail_contains_order_date_method_delivery_and_products(self):
        self.order['created'] = '2026-10-26T10:15:00+00:00'
        self.order['items'] = '[{"name":"Koszulka Home","size":"L","qty":2,"unit_price":5000}]'
        self.detail.update(address={'line1':'Sportowa 1','postal_code':'65-001','city':'Zielona Góra'},
                           customer_name='Jan Nowak', shipping_kind='courier')
        subject, body = sales.order_email(self.c, self.order, self.detail, 'payment_failed', 'https://store.example.test')
        for value in ('26.10.2026', 'PayU', 'Jan Nowak', 'Sportowa 1', '65-001 Zielona Góra',
                      '2 × Koszulka Home / L', '100.00 PLN', '129.00 PLN'):
            self.assertIn(value, body)
        page = mail.render_html(subject, body, 'https://store.example.test', 'payment_failed')
        self.assertIn('Adres dostawy', page)
        self.assertIn('Koszulka Home', page)

    def test_refund_mail_shows_refund_separately_from_original_total(self):
        self.detail['payment_status'] = 'partially_refunded'
        _, body = sales.order_email(self.c, self.order, self.detail, 'refund_completed',
                                   'https://store.example.test', event_amount=4900)
        self.assertIn('Kwota zwrotu: 49.00 PLN', body)
        self.assertIn('Wartość zamówienia: 129.00 PLN', body)
        self.assertNotIn('Razem do zapłaty:', body)

    def test_event_lookup_resolves_order_and_refund(self):
        self.c.execute("INSERT INTO payment_refunds VALUES(7,1,'refund-7',4900,'finalized')")
        with patch('commerce_payments.sales.details', return_value=self.detail):
            self.assertEqual(payments.notification_event(self.c, {'order': {'extOrderId': 'attempt-1'}}, 'rejected'), (42, 'payment_failed', 'attempt-1'))
        self.assertEqual(payments.notification_event(self.c, {'refund': {'refundId': 'refund-7'}}, 'refund_finalized'), (42, 'refund_completed', '7'))
        self.assertIsNone(payments.notification_event(self.c, {'order': {'extOrderId': 'attempt-1'}}, 'duplicate'))

    def test_html_has_specific_payment_action(self):
        html = mail.render_html('Zastal Store, płatność za ZS-00042 nie powiodła się',
                                'Możesz ponowić płatność.\n\nSzczegóły zamówienia: https://store.example.test/zamowienie?id=42',
                                'https://store.example.test', 'payment_failed')
        self.assertIn('Ponów płatność', html)


if __name__ == '__main__':
    unittest.main()
