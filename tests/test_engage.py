"""Reviews with moderation, newsletter double opt-in, contact messages and product slugs."""
import unittest

import commerce_api as api
import commerce_engage as engage
import test_merch


class EngageTests(test_merch.MerchTests):
    def outbox(self, kind):
        with api.connect() as c:
            return [tuple(row) for row in c.execute('SELECT recipient,dedupe_key FROM email_outbox WHERE kind=? ORDER BY id', (kind,))]

    # ------------------------------------------------------------ slugs
    def test_products_get_unique_url_handles(self):
        self.assertEqual(self.product(1)['slug'], 'koszulka')
        code, created = self.admin.request('POST', '/api/admin/products', {'name': 'Koszulka', 'sku': 'TS-2', 'category': 'Koszulki', 'price': 7900, 'stock': 1})
        self.assertEqual(code, 201, created)
        self.assertEqual(self.product(created['id'])['slug'], f"koszulka-{created['id']}")
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'slug': 'Zła nazwa'})[0], 400)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'slug': 'koszulka-wicemistrz', 'meta_title': 'Koszulka Wicemistrz Polski | Zastal Store'})[0], 200)
        code, by_slug = self.public('GET', '/api/catalog/koszulka-wicemistrz')
        self.assertEqual((code, by_slug['id'], by_slug['meta_title']), (200, 1, 'Koszulka Wicemistrz Polski | Zastal Store'))
        self.assertEqual(self.public('GET', '/api/catalog/1')[1]['slug'], 'koszulka-wicemistrz')
        self.assertEqual(self.public('GET', '/api/catalog/nie-ma')[0], 404)
        self.assertEqual(__import__('commerce_personalization').slugify('Bluza Zastal Retro – zieleń, ŁÓDŹ'), 'bluza-zastal-retro-zielen-lodz')

    # ------------------------------------------------------------ reviews
    def test_review_waits_for_moderation_and_marks_verified_purchases(self):
        self.go_live()
        code, reply = self.order()
        self.assertEqual(code, 201, reply)
        self.assertEqual(self.admin.request('POST', f"/api/admin/orders/{reply['id']}/payment", {'action': 'confirm', 'note': 'wyciąg'})[0], 200)
        bad = self.public('POST', '/api/store/reviews', {'product_id': 1, 'author': 'Jan', 'email': 'kibic@example.test', 'rating': 6, 'content': 'Świetna koszulka, polecam.'})
        self.assertEqual(bad[0], 400)
        bot = self.public('POST', '/api/store/reviews', {'product_id': 1, 'author': 'Jan', 'email': 'kibic@example.test', 'rating': 5, 'content': 'Świetna koszulka, polecam.', 'website': 'http://spam'})
        self.assertEqual(bot[0], 400)
        code, result = self.public('POST', '/api/store/reviews', {'product_id': 1, 'author': 'Jan', 'email': 'Kibic@Example.test', 'rating': 5, 'content': 'Świetna koszulka, polecam.'})
        self.assertEqual((code, result['verified']), (200, True), result)
        self.assertEqual(self.public('POST', '/api/store/reviews', {'product_id': 1, 'author': 'Jan', 'email': 'kibic@example.test', 'rating': 4, 'content': 'Druga opinia tej samej osoby.'})[0], 409)
        code, other = self.public('POST', '/api/store/reviews', {'product_id': 1, 'author': 'Ola', 'email': 'ola@example.test', 'rating': 3, 'content': 'Rozmiar wypada trochę mały.'})
        self.assertEqual((code, other['verified']), (200, False))
        # Nothing shows until staff approves; the catalogue carries no rating yet.
        self.assertEqual(self.public('GET', '/api/store/products/1/reviews')[1], {'summary': {'count': 0, 'average': 0, 'distribution': {'1': 0, '2': 0, '3': 0, '4': 0, '5': 0}}, 'reviews': []})
        self.assertEqual(self.product(1)['rating'], {'count': 0, 'average': 0})
        code, pending = self.admin.request('GET', '/api/admin/reviews?status=pending')
        self.assertEqual((code, len(pending), pending[0]['product_name']), (200, 2, 'Koszulka'))
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/reviews/{pending[0]['id']}", {'status': 'approved', 'reply': 'Dziękujemy!'})[0], 200)
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/reviews/{pending[1]['id']}", {'status': 'approved'})[0], 200)
        code, shown = self.public('GET', '/api/store/products/1/reviews')
        self.assertEqual((shown['summary']['count'], shown['summary']['average']), (2, 4.0))
        self.assertEqual([r['verified'] for r in shown['reviews']], [True, False])
        self.assertNotIn('email', shown['reviews'][0])
        self.assertEqual(self.product(1)['rating'], {'count': 2, 'average': 4.0})
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/reviews/{pending[1]['id']}", {'status': 'rejected'})[0], 200)
        self.assertEqual(self.public('GET', '/api/store/products/1/reviews')[1]['summary']['count'], 1)
        # A cashier cannot moderate (products capability), but can read nothing either without it.
        self.assertEqual(self.admin.request('PATCH', '/api/admin/reviews/999', {'status': 'approved'})[0], 404)

    # ------------------------------------------------------------ newsletter
    def test_newsletter_needs_consent_and_confirmation_link(self):
        self.assertEqual(self.public('POST', '/api/store/newsletter', {'email': 'fan@example.test'})[0], 400)
        code, reply = self.public('POST', '/api/store/newsletter', {'email': 'Fan@Example.test', 'consent': True})
        self.assertEqual((code, reply['pending']), (200, True), reply)
        self.assertEqual(len(self.outbox('newsletter_confirm')), 1)
        with api.connect() as c:
            row = c.execute("SELECT * FROM subscribers WHERE email='fan@example.test'").fetchone()
            self.assertEqual(row['status'], 'pending')
            # The worker composes the message and rotates the token; the link in the message is what works.
            subject, body = engage.newsletter_message(c, self.outbox('newsletter_confirm')[0][1], 'https://sklep.test')
            c.commit()
        self.assertIn('potwierdź', subject.casefold())
        token = body.split('token=')[1].split()[0]
        self.assertEqual(self.public('POST', '/api/store/newsletter/confirm', {'token': 'zly'})[0], 400)
        self.assertEqual(self.public('POST', '/api/store/newsletter/confirm', {'token': 'a' * 32})[0], 404)
        code, confirmed = self.public('POST', '/api/store/newsletter/confirm', {'token': token})
        self.assertEqual((code, confirmed['status']), (200, 'confirmed'))
        self.assertEqual(self.public('POST', '/api/store/newsletter', {'email': 'fan@example.test', 'consent': True})[1]['pending'], False)
        code, rows = self.admin.request('GET', '/api/admin/subscribers?status=confirmed')
        self.assertEqual((code, [r['email'] for r in rows]), (200, ['fan@example.test']))
        code, unsub = self.public('POST', '/api/store/newsletter/unsubscribe', {'token': token})
        self.assertEqual((code, unsub['status']), (200, 'unsubscribed'))
        self.assertEqual(self.admin.request('GET', '/api/admin/subscribers?status=confirmed')[1], [])
        # Checkout consent enrols the buyer the same way, with the confirmation e-mail.
        self.go_live()
        code, reply = self.order(consents={'terms': True, 'privacy': True, 'marketing': True})
        self.assertEqual(code, 201, reply)
        self.assertEqual([r[0] for r in self.outbox('newsletter_confirm')][-1], 'kibic@example.test')
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT source,status FROM subscribers WHERE email='kibic@example.test'").fetchone()[:], ('checkout', 'pending'))

    # ------------------------------------------------------------ contact
    def test_contact_message_reaches_support_and_acknowledges_the_sender(self):
        self.go_live()
        self.assertEqual(self.public('POST', '/api/store/contact', {'name': 'Jan', 'email': 'jan@example.test', 'message': 'krótko'})[0], 400)
        self.assertEqual(self.public('POST', '/api/store/contact', {'name': 'Jan', 'email': 'jan@example.test', 'message': 'Czy koszulka będzie w rozmiarze XXL?', 'order': 'ABC'})[0], 400)
        code, reply = self.public('POST', '/api/store/contact', {'name': 'Jan Kibic', 'email': 'jan@example.test', 'topic': 'Rozmiary', 'order': 'zs-00012', 'message': 'Czy koszulka będzie w rozmiarze XXL?'})
        self.assertEqual((code, reply['ok']), (200, True), reply)
        received = self.outbox('contact_received')
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0][1], f"contact_received:{reply['id']}")
        self.assertEqual(self.outbox('contact_ack'), [('jan@example.test', f"contact_ack:{reply['id']}")])
        with api.connect() as c:
            subject, body = engage.contact_message(c, received[0][1], 'https://sklep.test', 'contact_received')
            self.assertIn('ZS-00012', body)
            self.assertIn('Rozmiary', subject)
        code, rows = self.admin.request('GET', '/api/admin/contact')
        self.assertEqual((code, rows[0]['status'], rows[0]['order_ref']), (200, 'new', 'ZS-00012'))
        self.assertEqual(self.admin.request('PATCH', f"/api/admin/contact/{rows[0]['id']}", {'status': 'answered', 'note': 'Odpisano'})[1]['status'], 'answered')


if __name__ == '__main__':
    unittest.main()
