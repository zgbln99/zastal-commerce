"""Newsletter double opt-in, contact messages and product slugs."""
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


class BrandTests(test_merch.MerchTests):
    def test_competition_logos_are_edited_in_the_panel_and_shown_publicly(self):
        import base64, io
        from PIL import Image
        code, config = self.admin.request('GET', '/api/admin/brand')
        self.assertEqual((code, [c['name'] for c in config['competitions']]), (200, ['Orlen Basket Liga', 'FIBA Europe Cup']))
        public = self.public('GET', '/api/store/status')[1]['config']['brand']
        self.assertEqual([c['key'] for c in public['competitions']], ['liga', 'fec'])
        self.assertNotIn('enabled', public['competitions'][0])
        buffer = io.BytesIO()
        Image.new('RGBA', (120, 60), (22, 81, 20, 0)).save(buffer, 'PNG')
        code, upload = self.admin.request('POST', '/api/admin/brand/logo', {'image': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()})
        self.assertEqual(code, 201, upload)
        self.assertRegex(upload['url'], r'^/api/store/media/[0-9a-f]{32}\.webp$')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/brand', {'tagline': 'x' * 61, 'competitions': []})[0], 400)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/brand', {'competitions': [{'name': 'Liga', 'image': 'https://evil.test/a.png'}]})[0], 400)
        code, saved = self.admin.request('PATCH', '/api/admin/brand', {'tagline': 'Sklep kibica', 'competitions': [
            {'key': 'liga', 'name': 'Orlen Basket Liga', 'url': 'https://plk.pl', 'image': upload['url'], 'enabled': True},
            {'key': 'fec', 'name': 'FIBA Europe Cup', 'url': '', 'image': '', 'enabled': False}]})
        self.assertEqual((code, saved['tagline']), (200, 'Sklep kibica'), saved)
        public = self.public('GET', '/api/store/status')[1]['config']['brand']
        self.assertEqual((public['tagline'], [c['name'] for c in public['competitions']], public['competitions'][0]['image']), ('Sklep kibica', ['Orlen Basket Liga'], upload['url']))
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{self.port}' + upload['url'], timeout=8) as r:
            self.assertEqual((r.status, r.headers.get('Content-Type', '').split(';')[0]), (200, 'image/webp'))

    def test_html_mail_theme_wraps_every_message(self):
        import commerce_mailtheme as theme
        body = 'Dziękujemy za zamówienie ZS-00042.\nDo zapłaty: 124.99 PLN\n\nDane do przelewu:\n  Odbiorca: Zastal\n  Tytuł: ZS-00042\n\nSzczegóły zamówienia: https://sklep.test/zamowienie?id=42&token=abc\n'
        page = theme.render('Zastal Store, potwierdzenie zamówienia ZS-00042', body, 'https://sklep.test', {'seller_name': 'Zastal S.A.', 'support_email': 'sklep@zastal.test'})
        self.assertIn('<h1', page)
        self.assertIn('Potwierdzenie zamówienia ZS-00042</h1>', page)
        self.assertIn('Otwórz zamówienie', page)
        self.assertIn('Odbiorca: Zastal', page)
        self.assertIn('sklep@zastal.test', page)
        self.assertIn('/assets/icon-192.png', page)
        self.assertNotIn('<script', page)
        self.assertIn('&lt;b&gt;', theme.render('x', '<b>nie html</b>', 'https://sklep.test'))
        for kind in theme.SAMPLES:
            self.assertIn('<h1', theme.sample(kind, 'https://sklep.test'))
        import urllib.request
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}/api/admin/email/preview?kind=gift_card_issued', headers={'Cookie': self.admin.cookie} if getattr(self.admin, 'cookie', '') else {})
        try:
            with urllib.request.urlopen(request, timeout=8) as r:
                self.assertIn('Kod karty', r.read().decode())
        except urllib.error.HTTPError as ex:
            self.assertIn(ex.code, (401, 403))  # without the session cookie the preview stays private
