"""Real HTTP tests for product creation and immutable shirt print snapshots."""
import hashlib
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
import commerce_api as api
from http_client import Client

PASSWORD = 'Personalization admin password 2026'


class PersonalizationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'shirts.sqlite3'
        api.TOKEN = PASSWORD
        api.LIMITS.clear()
        api.auth.clear_limits()
        # Exercise an actual six-column pre-migration product table.
        with sqlite3.connect(api.DATABASE) as c:
            c.execute('CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,sku TEXT UNIQUE NOT NULL,category TEXT,price INTEGER NOT NULL,stock INTEGER NOT NULL DEFAULT 0)')
            c.execute("INSERT INTO products VALUES(1,'Old shirt','OLD','Koszulki',7900,25)")
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.guest = Client(self.server.server_address[1])
        self.admin = Client(self.server.server_address[1])

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def privileged(self, method, path, data=None):
        if not self.admin.csrf:
            self.assertEqual(self.admin.login('admin', PASSWORD)[0], 200)
        return self.admin.request(method, path, data)

    def enable(self, **extra):
        code, product = self.privileged('PATCH', '/api/admin/products/1', {
            'personalization_enabled': True, 'personalization_fee': 2500, **extra})
        self.assertEqual(code, 200, product)
        return product

    def line(self, personalization=None, **extra):
        return {'id': 1, 'size': 'L', 'quantity': 1,
                **({'personalization': personalization} if personalization is not None else {}), **extra}

    def order(self, lines=None, client=None, **extra):
        api.LIMITS.clear()
        return (client or self.guest).request('POST', '/api/orders', {
            'items': lines or [self.line()], 'fulfillment': 'odbior', **extra})

    def detail(self, receipt):
        code, detail = self.guest.request('GET', '/api/orders/' + str(receipt['id']) + '?token=' + receipt['tracking_token'])
        self.assertEqual(code, 200)
        return detail

    def test_migration_retains_legacy_product_variants_and_defaults(self):
        code, product = self.guest.request('GET', '/api/catalog/1')
        self.assertEqual(code, 200)
        self.assertEqual(product['sizes'], ['S', 'M', 'L', 'XL', 'XXL'])
        self.assertFalse(product['personalization_enabled'])
        self.assertFalse(product['personalization_required'])
        self.assertEqual(product['personalization_fee'], 0)
        self.assertEqual(product['image'], '')
        self.assertEqual(product['subtitle'], '')
        before = product['variants']
        api.init()
        self.assertEqual(self.guest.request('GET', '/api/catalog/1')[1]['variants'], before)
        self.assertEqual(len(self.guest.request('GET', '/api/products')[1]), 1)

    def test_product_creation_generates_variants_eans_and_public_metadata(self):
        payload = {'name': 'Koszulka meczowa', 'sku': 'MATCH', 'category': 'Koszulki',
                   'price': 14900, 'stock': 13, 'image': 'https://example.test/jersey.jpg',
                   'subtitle': 'Oficjalna koszulka', 'personalization_enabled': True,
                   'personalization_required': True, 'personalization_fee': 1900}
        code, product = self.privileged('POST', '/api/admin/products', payload)
        self.assertEqual(code, 201, product)
        self.assertEqual(product['sizes'], ['S', 'M', 'L', 'XL', 'XXL'])
        self.assertEqual(sum(v['stock'] for v in product['variants']), 13)
        self.assertEqual(len({v['ean'] for v in product['variants']}), 5)
        for variant in product['variants']:
            stem = variant['ean'][:-1]
            self.assertEqual(int(variant['ean'][-1]), (-sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(stem))) % 10)
            self.assertEqual(variant['sku'], 'MATCH-' + variant['size'])
        for key in ['image', 'subtitle', 'personalization_enabled', 'personalization_required', 'personalization_fee']:
            self.assertEqual(product[key], payload[key])
        self.assertEqual(self.guest.request('GET', '/api/catalog/' + str(product['id']))[1], product)
        self.assertEqual(self.privileged('POST', '/api/admin/products', payload)[0], 400)
        self.assertEqual(len(self.guest.request('GET', '/api/catalog')[1]), 2)

    def test_product_creation_rejects_invalid_values_transactionally(self):
        baseline = {'name': 'New', 'sku': 'NEW', 'category': 'Dzieci', 'price': 100, 'stock': 0}
        bad = [('name', 42), ('sku', 'a b'), ('category', 'Other'), ('price', True), ('price', 0),
               ('stock', -1), ('stock', 100001), ('stock', '5'), ('personalization_enabled', 1),
               ('personalization_required', True), ('personalization_fee', -1), ('personalization_fee', '10'),
               ('image', 'http://example.test/a'), ('image', 'https://user:secret@example.test/a'),
               ('image', '//evil.test/a'), ('image', '/assets/../secret'), ('subtitle', {})]
        for key, value in bad:
            with self.subTest(key=key, value=value):
                self.assertEqual(self.privileged('POST', '/api/admin/products', {**baseline, key: value})[0], 400)
        self.assertEqual(len(self.guest.request('GET', '/api/catalog')[1]), 1)
        code, p = self.privileged('POST', '/api/admin/products', {**baseline, 'image': '/assets/photo.webp'})
        self.assertEqual(code, 201)
        self.assertEqual(p['sizes'], ['116', '128', '140', '152', '164'])

    def test_product_patch_updates_metadata_without_redefining_variants(self):
        before = self.guest.request('GET', '/api/catalog/1')[1]['variants']
        product = self.enable(name='Updated', price=9000, image='/assets/new.webp', subtitle='Nowa')
        self.assertEqual(product['name'], 'Updated')
        self.assertEqual(product['price'], 9000)
        self.assertEqual(product['variants'], before)
        self.assertEqual(self.privileged('PATCH', '/api/admin/products/1', {'sku': 'CHANGED'})[0], 400)
        self.assertEqual(self.privileged('PATCH', '/api/admin/products/1', {'category': 'Dzieci'})[0], 400)
        self.assertEqual(self.privileged('PATCH', '/api/admin/products/1', {'stock': 100})[0], 400)
        self.assertEqual(self.privileged('PATCH', '/api/admin/products/1', {'name': 'Old API', 'price': 8000})[0], 200)

    def test_roster_is_official_and_seed_is_not_reapplied_after_restart(self):
        code, roster = self.guest.request('GET', '/api/players')
        self.assertEqual(code, 200)
        self.assertEqual(roster['source_url'], 'https://basketzg.pl/players')
        self.assertEqual(roster['verified_at'], '2026-10-10')
        self.assertEqual([(p['print_name'], p['number']) for p in roster['players']], [
            ('GALEWSKI', '1'), ('MAZURCZAK', '3'), ('GARRISON', '0'), ('MATCZAK', '8'),
            ('MAJEWSKI', '6'), ('DENIS', '9'), ('WHITE', '13'), ('SOLOMON', '2'),
            ('BEECH', '22'), ('WÓJCIK', '25'), ('SULIMA', '7'), ('BRKIĆ', '21')])
        self.assertNotIn('active', roster['players'][0])
        pid = roster['players'][0]['id']
        self.assertEqual(self.privileged('PATCH', '/api/admin/players/' + str(pid), {'print_name': 'ZMIANA', 'number': '00', 'active': False})[0], 200)
        api.init()
        self.assertEqual(len(self.guest.request('GET', '/api/players')[1]['players']), 11)
        edited = self.privileged('GET', '/api/admin/players')[1]['players'][0]
        self.assertEqual((edited['print_name'], edited['number'], edited['active']), ('ZMIANA', '00', False))
        # Even a deliberately empty roster must remain empty once initialized.
        with api.connect() as c:
            c.execute('DELETE FROM players')
        api.init()
        self.assertEqual(self.guest.request('GET', '/api/players')[1]['players'], [])

    def test_roster_creation_validates_strings_boolean_and_print_characters(self):
        valid = {'name': 'Jan Test', 'print_name': 'o’neill', 'number': '00', 'active': True}
        code, p = self.privileged('POST', '/api/admin/players', valid)
        self.assertEqual(code, 201, p)
        self.assertEqual(p['print_name'], 'O’NEILL')
        for field, value in [('name', 1), ('print_name', 'A😀'), ('number', 0), ('number', '９'), ('active', 1)]:
            self.assertEqual(self.privileged('POST', '/api/admin/players', {**valid, field: value})[0], 400)
        self.assertEqual(self.privileged('PATCH', '/api/admin/players/9999', {'active': False})[0], 404)

    def test_new_privileged_routes_enforce_role_and_csrf(self):
        self.assertEqual(self.guest.request('POST', '/api/admin/products', {})[0], 401)
        self.assertEqual(self.guest.request('GET', '/api/admin/players')[0], 401)
        self.assertEqual(self.guest.register()[0], 201)
        self.assertEqual(self.guest.request('POST', '/api/admin/players', {})[0], 403)
        self.privileged('GET', '/api/admin/players')
        self.assertEqual(self.admin.request('POST', '/api/admin/products', {}, csrf=False)[0], 403)

    def test_custom_print_normalizes_name_preserves_zero_and_uses_server_fee(self):
        self.enable()
        for number in ['0', '00']:
            code, receipt = self.order([self.line({'mode': 'custom', 'name': '  wo\u0301jcik  ', 'number': number},
                                                   unit_price=1, base_unit_price=1, personalization_fee=1)])
            self.assertEqual(code, 201, receipt)
            detail = self.detail(receipt)
            item = detail['items'][0]
            self.assertEqual(item['personalization'], {'mode': 'custom', 'name': 'WÓJCIK', 'number': number})
            self.assertEqual((item['base_unit_price'], item['personalization_fee'], item['unit_price']), (7900, 2500, 10400))
            self.assertEqual(detail['subtotal'], 10400)

    def test_player_print_uses_server_snapshot_and_exact_retry_survives_edits(self):
        self.enable()
        players = self.guest.request('GET', '/api/players')[1]['players']
        pid = next(p['id'] for p in players if p['print_name'] == 'GARRISON')
        lines = [self.line({'mode': 'player', 'player_id': pid, 'name': 'SPOOF', 'number': '99'})]
        key = 'immutable-shirt-attempt-1234'
        code, receipt = self.order(lines, idempotency_key=key)
        self.assertEqual(code, 201, receipt)
        expected = self.detail(receipt)
        self.assertEqual(expected['items'][0]['personalization'], {'mode': 'player', 'player_id': pid, 'name': 'GARRISON', 'number': '0'})
        self.privileged('PATCH', '/api/admin/players/' + str(pid), {'print_name': 'CHANGED', 'number': '99', 'active': False})
        self.privileged('PATCH', '/api/admin/products/1', {'price': 9000, 'personalization_enabled': False, 'personalization_fee': 9999})
        self.assertEqual(self.order(lines, idempotency_key=key), (200, receipt))
        self.assertEqual(self.detail(receipt), expected)
        self.assertEqual(self.order(lines, idempotency_key='new-shirt-attempt-123456')[0], 400)

    def test_production_queue_includes_immutable_print_for_an_older_order_line(self):
        self.enable()
        players = self.guest.request('GET', '/api/players')[1]['players']
        pid = next(p['id'] for p in players if p['print_name'] == 'GARRISON')
        code, receipt = self.order([
            self.line({'mode': 'custom', 'name': 'First', 'number': '12'}),
            self.line({'mode': 'player', 'player_id': pid}, quantity=2),
        ])
        self.assertEqual(code, 201, receipt)
        batch = self.privileged('GET', '/api/admin/transfers')[1][0]
        code, task = self.privileged('POST', '/api/admin/production', {
            'order_id': receipt['id'], 'line_index': 1, 'batch_id': batch['id']})
        self.assertEqual(code, 201, task)
        after = next(b for b in self.privileged('GET', '/api/admin/transfers')[1] if b['id'] == batch['id'])
        self.assertEqual(after['available'], batch['available'] - 2)
        self.privileged('PATCH', '/api/admin/players/' + str(pid), {'print_name': 'CHANGED', 'number': '99', 'active': False})
        self.privileged('PATCH', '/api/admin/products/1', {'name': 'Changed product'})
        # Queue details must remain available beyond the latest 300 orders.
        with api.connect() as c:
            c.executemany('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',
                          [('2026-10-10', '[]', 0, 'nowe')] * 300)
        self.assertNotIn(receipt['id'], [o['id'] for o in self.privileged('GET', '/api/admin/orders')[1]])
        code, queue = self.privileged('GET', '/api/admin/production')
        self.assertEqual(code, 200, queue)
        queued = next(t for t in queue if t['id'] == task['id'])
        self.assertEqual((queued.get('product_name'), queued.get('size'), queued.get('qty')), ('Old shirt', 'L', 2))
        self.assertEqual(queued.get('personalization'), {'mode': 'player', 'player_id': pid, 'name': 'GARRISON', 'number': '0'})
        self.assertEqual(queued['status'], 'oczekuje')
        self.assertNotIn('order_items', queued)

    def test_invalid_print_shapes_are_rejected_before_idempotence(self):
        self.enable()
        key = 'custom-immutable-attempt-1234'
        good = {'mode': 'custom', 'name': 'Jan', 'number': '0'}
        self.assertEqual(self.order([self.line(good)], idempotency_key=key)[0], 201)
        invalid = [False, [], {}, {'mode': 'other'}, {'mode': 'player', 'player_id': True},
                   {'mode': 'player', 'player_id': '1'}, {'mode': 'custom', 'name': None, 'number': '0'},
                   {'mode': 'custom', 'name': 'A😀', 'number': '0'}, {'mode': 'custom', 'name': 'A1', 'number': '0'},
                   {'mode': 'custom', 'name': '\u0301', 'number': '0'}, {'mode': 'custom', 'name': '.', 'number': '0'},
                   {'mode': 'custom', 'name': 'A\nB', 'number': '0'}, {'mode': 'custom', 'name': 'A' * 21, 'number': '0'},
                   {'mode': 'custom', 'name': 'A', 'number': 0}, {'mode': 'custom', 'name': 'A', 'number': '٠'},
                   {'mode': 'custom', 'name': 'A', 'number': '100'}]
        for personalization in invalid:
            with self.subTest(personalization=personalization):
                self.assertEqual(self.order([self.line(personalization)], idempotency_key=key)[0], 400)

    def test_disabled_required_inactive_and_missing_players_reject_without_stock_loss(self):
        custom = {'mode': 'custom', 'name': 'Jan', 'number': '00'}
        self.assertEqual(self.order([self.line(custom)])[0], 400)
        self.enable(personalization_required=True)
        self.assertEqual(self.order()[0], 400)
        pid = self.guest.request('GET', '/api/players')[1]['players'][0]['id']
        self.privileged('PATCH', '/api/admin/players/' + str(pid), {'active': False})
        for player_id in [pid, 99999]:
            self.assertEqual(self.order([self.line({'mode': 'player', 'player_id': player_id})])[0], 400)
        self.assertEqual(next(v['stock'] for v in self.guest.request('GET', '/api/catalog/1')[1]['variants'] if v['size'] == 'L'), 5)

    def test_distinct_prints_share_variant_stock_and_rollback_as_a_transaction(self):
        self.enable()
        lines = [self.line({'mode': 'custom', 'name': 'ONE', 'number': '0'}, quantity=3),
                 self.line({'mode': 'custom', 'name': 'TWO', 'number': '00'}, quantity=3)]
        self.assertEqual(self.order(lines)[0], 400)
        self.assertEqual(next(v['stock'] for v in self.guest.request('GET', '/api/catalog/1')[1]['variants'] if v['size'] == 'L'), 5)
        lines[1]['quantity'] = 2
        code, receipt = self.order(lines)
        self.assertEqual(code, 201)
        self.assertEqual(len(self.detail(receipt)['items']), 2)
        self.assertEqual(self.detail(receipt)['subtotal'], 52000)
        self.assertEqual(next(v['stock'] for v in self.guest.request('GET', '/api/catalog/1')[1]['variants'] if v['size'] == 'L'), 0)
        self.assertEqual(self.privileged('PATCH', '/api/admin/orders/' + str(receipt['id']), {'status': 'anulowane'})[0], 200)
        self.assertEqual(next(v['stock'] for v in self.guest.request('GET', '/api/catalog/1')[1]['variants'] if v['size'] == 'L'), 5)

    def test_print_changes_conflict_and_order_ownership_remains_enforced(self):
        self.enable()
        _, registration = self.guest.register()
        uid = registration['user']['id']
        key = 'owned-personalized-attempt-1234'
        lines = [self.line({'mode': 'custom', 'name': 'Jan', 'number': '0'})]
        code, receipt = self.order(lines, idempotency_key=key, account_id=uid)
        self.assertEqual(code, 201)
        other = Client(self.server.server_address[1])
        _, registered = other.register('other@example.test')
        self.assertEqual(self.order(lines, client=other, idempotency_key=key, account_id=registered['user']['id'])[0], 409)
        self.assertEqual(other.request('GET', '/api/account/orders/' + str(receipt['id']))[0], 404)
        for changed in [{'mode': 'custom', 'name': 'Jan', 'number': '00'}, {'mode': 'custom', 'name': 'Adam', 'number': '0'}, {'mode': 'player', 'player_id': 1}]:
            self.assertEqual(self.order([self.line(changed)], idempotency_key=key, account_id=uid)[0], 409)
        own = self.guest.request('GET', '/api/account/orders/' + str(receipt['id']))[1]
        self.assertEqual(own['items'][0]['personalization']['name'], 'JAN')

    def test_nonprint_fingerprint_preserves_v04_idempotent_receipt(self):
        lines = [self.line()]
        key = 'old-v04-attempt-123456'
        code, receipt = self.order(lines, idempotency_key=key)
        self.assertEqual(code, 201)
        expected = hashlib.sha256(json.dumps({'items': lines, 'fulfillment': 'odbior'}, sort_keys=True).encode()).hexdigest()
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT fingerprint FROM order_receipts WHERE order_id=?', (receipt['id'],)).fetchone()[0], expected)
        self.assertEqual(self.order(lines, idempotency_key=key), (200, receipt))
        item = self.detail(receipt)['items'][0]
        self.assertEqual(item['base_unit_price'], 7900)
        self.assertEqual(item['personalization_fee'], 0)



    def test_extended_options_validate_and_are_copied_onto_order_lines(self):
        code, product = self.privileged('POST', '/api/admin/products', {
            'name': 'Koszulka meczowa', 'sku': 'ZS-MECZ-26', 'category': 'Koszulki', 'price': 18900, 'stock': 10,
            'personalization_enabled': True, 'personalization_required': True, 'personalization_fee': 3500,
            'decoration_method': 'haft', 'preorder': True, 'preorder_note': 'Wysyłka od 20 listopada', 'preorder_until': '2026-11-20',
            'size_guide': 'S 48 cm / M 51 cm', 'image': '/assets/photos/product-3.webp',
            'description': 'Koszulka na mecz.\n\n## Materiał i krój\n- Bawełna 100%',
            'print_layout': {'image': '/assets/photos/product-3.webp', 'areas': {'name': {'x': 30, 'y': 18, 'w': 40, 'h': 6}, 'number': {'x': 35, 'y': 28, 'w': 30, 'h': 22}}, 'color': '#FFFFFF', 'font': 'block', 'calibrated': False}})
        self.assertEqual(code, 201, product)
        self.assertEqual(product['decoration_method'], 'haft')
        self.assertEqual(product['decoration_method_label'], 'Haft')
        self.assertTrue(product['preorder'])
        self.assertEqual(product['print_layout']['areas']['number']['h'], 22.0)
        self.assertEqual(product['print_layout']['color'], '#ffffff')
        public = self.guest.request('GET', '/api/catalog/' + str(product['id']))[1]
        self.assertEqual(public['size_guide'], 'S 48 cm / M 51 cm')
        self.assertEqual(public['description'], 'Koszulka na mecz.\n\n## Materiał i krój\n- Bawełna 100%')
        self.assertEqual(public['preorder_note'], 'Wysyłka od 20 listopada')
        for bad in [{'decoration_method': 'laser'}, {'preorder': True, 'preorder_note': ''}, {'preorder_until': '20-11-2026'},
                    {'description': 'Materiał: [np. bawełna 100%]'}, {'description': 'Opis <b>pogrubiony</b>'},
                    {'print_layout': {'image': '/assets/photos/product-3.webp', 'areas': {'name': {'x': 90, 'y': 0, 'w': 20, 'h': 5}}}},
                    {'print_layout': {'image': '', 'areas': {'name': {'x': 1, 'y': 1, 'w': 5, 'h': 5}}}},
                    {'print_layout': {'image': '/assets/photos/product-3.webp', 'areas': {'logo': {'x': 1, 'y': 1, 'w': 5, 'h': 5}}}}]:
            with self.subTest(bad=bad):
                self.assertEqual(self.privileged('PATCH', '/api/admin/products/' + str(product['id']), bad)[0], 400)
        code, order = self.order([{'id': product['id'], 'size': 'M', 'quantity': 1, 'personalization': {'mode': 'custom', 'name': 'Kibic', 'number': '7'}}], idempotency_key='extended-line-key-000001')
        self.assertEqual(code, 201, order)
        with api.connect() as c:
            line = json.loads(c.execute('SELECT items FROM orders WHERE id=?', (order['id'],)).fetchone()[0])[0]
        self.assertEqual(line['decoration_method'], 'haft')
        self.assertEqual(line['print_layout']['areas']['name']['w'], 40.0)
        self.assertEqual(line['preorder'], {'note': 'Wysyłka od 20 listopada', 'until': '2026-11-20'})
        # Changing the product later never rewrites the stored line.
        self.assertEqual(self.privileged('PATCH', '/api/admin/products/' + str(product['id']), {'print_layout': None, 'decoration_method': 'dtf'})[0], 200)
        with api.connect() as c:
            again = json.loads(c.execute('SELECT items FROM orders WHERE id=?', (order['id'],)).fetchone()[0])[0]
        self.assertEqual(again['print_layout'], line['print_layout'])
        self.assertEqual(self.privileged('GET', '/api/admin/products')[1][-1]['print_layout'], None)


if __name__ == '__main__':
    unittest.main()
