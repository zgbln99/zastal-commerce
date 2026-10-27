"""Accounts use only temporary DBs and a loopback API, never live identities."""
import hashlib
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from pathlib import Path
import commerce_api as api
from http_client import Client

ADMIN_PASSWORD = 'Fixture admin password 2026'
CUSTOMER_PASSWORD = 'Customer password 2026'


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'accounts.sqlite3'
        api.TOKEN = ADMIN_PASSWORD
        api.LIMITS.clear()
        if hasattr(api, 'auth'):
            api.auth.clear_limits()
        api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products VALUES(1,'Koszulka','TS','Koszulki',7900,25)")
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.customer = Client(self.server.server_address[1])
        self.admin = Client(self.server.server_address[1])

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def order(self, client, **extra):
        return client.request('POST', '/api/orders', {
            'items': [{'id': 1, 'size': 'L', 'quantity': 1}],
            'fulfillment': 'odbior', **extra})

    def test_registration_creates_customer_and_private_rotated_cookie(self):
        code, anonymous = self.customer.session()
        self.assertEqual(code, 200)
        before = self.customer.cookie
        code, result = self.customer.request('POST', '/api/auth/register', {
            'email': ' Test@Example.test ', 'name': 'Jan', 'password': CUSTOMER_PASSWORD,
            'role': 'admin', 'active': False})
        self.assertEqual(code, 201)
        self.assertEqual(result['user']['identifier'], 'test@example.test')
        self.assertEqual(result['user']['role'], 'customer')
        self.assertNotEqual(before, self.customer.cookie)
        header = self.customer.headers.get('Set-Cookie')
        for flag in ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']:
            self.assertIn(flag, header)
        self.assertNotIn('Domain=', header)
        self.assertNotIn('password_hash', str(result))
        self.assertNotIn('recovery_hash', str(result))
        with api.connect() as c:
            row = c.execute('SELECT * FROM users WHERE id=?', (result['user']['id'],)).fetchone()
            self.assertNotEqual(row['password_hash'], CUSTOMER_PASSWORD)
            self.assertTrue(row['password_hash'].startswith('scrypt$'))
            self.assertEqual(row['recovery_hash'], hashlib.sha256(result['recovery_key'].encode()).hexdigest())

    def test_registration_validates_email_password_and_case_insensitive_duplicates(self):
        self.customer.session()
        for email, password in [('bad', CUSTOMER_PASSWORD), ('x@y.test', 'short'), ('x@y.test', 'x' * 129)]:
            code, _ = self.customer.request('POST', '/api/auth/register', {'email': email, 'name': 'Jan', 'password': password})
            self.assertEqual(code, 400)
        self.assertEqual(self.customer.register('Test@Example.test')[0], 201)
        another = Client(self.server.server_address[1])
        self.assertEqual(another.register('test@example.test')[0], 409)

    def test_roles_are_checked_server_side_and_old_bearer_is_not_authorization(self):
        self.assertEqual(self.admin.request('GET', '/api/admin/inventory')[0], 401)
        self.assertEqual(self.admin.request('GET', '/api/admin/inventory', headers={'Authorization': 'Bearer ' + ADMIN_PASSWORD})[0], 401)
        self.assertEqual(self.customer.register()[0], 201)
        # A shop-account session is not a panel session: the panel API answers "sign in", not "forbidden".
        code, refused = self.customer.request('GET', '/api/admin/inventory')
        self.assertEqual((code, refused['code']), (401, 'session_required'))
        self.assertEqual(self.customer.request('PATCH', '/api/admin/products/1', {'name': 'Hijacked', 'price': 1})[0], 401)
        self.assertEqual(self.admin.login('admin', ADMIN_PASSWORD)[0], 200)
        self.assertEqual(self.admin.request('GET', '/api/admin/inventory')[0], 200)

    def test_panel_and_shop_sessions_are_independent(self):
        port = self.server.server_address[1]
        browser = Client(port)
        self.assertEqual(browser.register('fan@example.test')[0], 201)
        shop_cookie = browser.jar['__Host-zastal_session']
        # Each account type has its own door: staff cannot sign in to the shop, customers cannot sign in to the panel.
        self.assertEqual(browser.login('admin', ADMIN_PASSWORD, staff=False)[0], 401)
        outsider = Client(port)
        self.assertEqual(outsider.login('fan@example.test', 'Customer password 2026', staff=True)[0], 401)
        self.assertEqual(outsider.request('GET', '/api/admin/inventory')[0], 401)
        # Signing in to the panel in the same browser leaves the shop login exactly as it was.
        code, panel = browser.login('admin', ADMIN_PASSWORD)
        self.assertEqual((code, panel['user']['role']), (200, 'admin'))
        self.assertEqual(browser.jar['__Host-zastal_session'], shop_cookie)
        self.assertIn('__Host-zastal_staff', browser.jar)
        self.assertEqual(browser.session(staff=False)[1]['user']['identifier'], 'fan@example.test')
        self.assertEqual(browser.session(staff=True)[1]['user']['identifier'], 'admin')
        self.assertEqual(browser.request('GET', '/api/account/orders')[0], 200)
        self.assertEqual(browser.request('GET', '/api/admin/inventory')[0], 200)
        # The panel cookie alone is not a shop account, and the shop cookie alone is not a panel session.
        staff_only = Client(port)
        self.assertEqual(staff_only.login('admin', ADMIN_PASSWORD)[0], 200)
        self.assertIsNone(staff_only.session(staff=False)[1]['user'])
        self.assertEqual(staff_only.request('GET', '/api/account/orders')[0], 401)
        # Signing out of the panel does not sign out the shop, and the other way round.
        self.assertIsNone(browser.request('POST', '/api/staff/auth/logout', {})[1]['user'])
        self.assertEqual(browser.request('GET', '/api/admin/inventory')[0], 401)
        self.assertEqual(browser.session(staff=False)[1]['user']['identifier'], 'fan@example.test')
        self.assertEqual(browser.login('admin', ADMIN_PASSWORD)[0], 200)
        self.assertIsNone(browser.request('POST', '/api/auth/logout', {})[1]['user'])
        self.assertEqual(browser.session(staff=True)[1]['user']['identifier'], 'admin')
        self.assertEqual(browser.request('GET', '/api/admin/inventory')[0], 200)
        # The panel has no registration route.
        self.assertEqual(browser.request('POST', '/api/staff/auth/register', {'email': 'x@example.test', 'name': 'X', 'password': 'Another password 2026'})[0], 404)

    def test_sign_out_still_works_when_the_session_table_cannot_be_written(self):
        import sqlite3
        from unittest.mock import patch
        browser = Client(self.server.server_address[1])
        self.assertEqual(browser.login('admin', ADMIN_PASSWORD)[0], 200)
        locked = sqlite3.OperationalError('database is locked')
        for path in ('/api/staff/auth/logout',):
            with patch.object(api.auth, 'rotate', side_effect=locked):
                code, reply = browser.request('POST', path, {})
            self.assertEqual((code, reply['user']), (200, None))
            cookies = browser.headers.get_all('Set-Cookie')
            self.assertTrue(any(c.startswith('__Host-zastal_staff=;') and 'Max-Age=0' in c for c in cookies), cookies)
        # The browser dropped the cookie: the panel API asks to sign in again.
        browser.jar.pop('__Host-zastal_staff', None)
        self.assertEqual(browser.request('GET', '/api/admin/inventory')[0], 401)
        # The customer door behaves the same way.
        fan = Client(self.server.server_address[1])
        self.assertEqual(fan.register('lock@example.test')[0], 201)
        with patch.object(api.auth, 'rotate', side_effect=locked):
            code, reply = fan.request('POST', '/api/auth/logout', {})
        self.assertEqual((code, reply['user']), (200, None))

    def test_database_refusals_are_explained_on_staff_routes_and_in_health(self):
        import sqlite3
        from unittest.mock import patch
        port = self.server.server_address[1]
        browser = Client(port)
        full = sqlite3.OperationalError('database or disk is full')
        with patch.object(api.auth, 'rotate', side_effect=full):
            code, reply = browser.request('GET', '/api/staff/auth/session')
            shop_code, shop_reply = Client(port).request('GET', '/api/auth/session')
        self.assertEqual(code, 500)
        self.assertEqual(reply['error'], 'Błąd bazy danych')
        self.assertIn('disk is full', reply['detail'])
        # A read-only database says who runs the API and who owns the file: the usual cause is a root-owned folder.
        with patch.object(api.auth, 'rotate', side_effect=sqlite3.OperationalError('attempt to write a readonly database')):
            code, reply = Client(port).request('GET', '/api/staff/auth/session')
        self.assertEqual(code, 500)
        self.assertIn('readonly', reply['detail'])
        self.assertRegex(reply['detail'], r'API działa jako uid \d+, plik bazy należy do uid \d+, katalog do uid \d+')
        # The public shop does not get internals.
        self.assertEqual(shop_code, 500)
        self.assertNotIn('detail', shop_reply)
        code, health = browser.request('GET', '/health')
        self.assertEqual((code, health['ok'], health['db_writable']), (200, True, True))
        self.assertGreater(health['disk_free_mb'], 0)
        with patch('shutil.disk_usage') as usage:
            usage.return_value.free = 50 * 1048576
            code, health = browser.request('GET', '/health')
        self.assertEqual((code, health['ok'], health['error'], health['disk_free_mb']), (503, False, 'storage', 50))

    def test_csrf_and_cross_origin_mutations_fail_without_changing_identity(self):
        self.assertEqual(self.customer.register()[0], 201)
        self.assertEqual(self.customer.request('PATCH', '/api/account/profile', {'name': 'Wrong'}, csrf=False)[0], 403)
        self.assertEqual(self.customer.request('PATCH', '/api/account/profile', {'name': 'Wrong'}, headers={'Origin': 'https://attacker.test'})[0], 403)
        self.assertEqual(self.customer.request('PATCH', '/api/account/profile', {'name': 'Wrong'}, headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.customer.session()[1]['user']['name'], 'Kibic')
        self.assertEqual(self.customer.request('PATCH', '/api/account/profile', {'name': 'Anna'})[1]['user']['name'], 'Anna')

    def test_login_rotates_anonymous_session_and_returns_generic_wrong_password(self):
        self.customer.register()
        client = Client(self.server.server_address[1])
        client.session()
        old_cookie, old_csrf = client.cookie, client.csrf
        code, bad = client.request('POST', '/api/auth/login', {'identifier': 'customer@example.test', 'password': 'Wrong password 2026'})
        self.assertEqual(code, 401)
        code, missing = client.request('POST', '/api/auth/login', {'identifier': 'missing@example.test', 'password': 'Wrong password 2026'})
        self.assertEqual(bad['error'], missing['error'])
        self.assertEqual(client.login('CUSTOMER@example.test', CUSTOMER_PASSWORD)[0], 200)
        self.assertNotEqual(old_cookie, client.cookie)
        stolen = Client(self.server.server_address[1])
        stolen.cookie, stolen.csrf = old_cookie, old_csrf
        self.assertEqual(stolen.request('GET', '/api/account/orders')[0], 401)

    def test_non_ascii_csrf_header_is_rejected_without_mutating_account(self):
        self.customer.register()
        code, result = self.customer.request('PATCH', '/api/account/profile',
            {'name': 'Wrong'}, headers={'X-CSRF-Token': 'é'})
        self.assertEqual(code, 403)
        self.assertEqual(result['code'], 'csrf_invalid')
        self.assertEqual(self.customer.session()[1]['user']['name'], 'Kibic')

    def test_in_flight_old_password_requests_cannot_survive_password_rotation(self):
        latest_password = 'Latest account password 2026'
        stale_password = 'Stale account password 2026'
        for index, action in enumerate(('login', 'password', 'recovery-key')):
            with self.subTest(action=action):
                email = 'race' + str(index) + '@example.test'
                owner = Client(self.server.server_address[1])
                self.assertEqual(owner.register(email)[0], 201)
                other = Client(self.server.server_address[1])
                self.assertEqual(other.login(email, CUSTOMER_PASSWORD)[0], 200)
                delayed = Client(self.server.server_address[1]) if action == 'login' else owner
                if action == 'login':
                    delayed.session()
                verified, release, lock = threading.Event(), threading.Event(), threading.Lock()
                armed = [True]
                original = api.auth.verify_password

                def pause_first(password, encoded):
                    valid = original(password, encoded)
                    with lock:
                        pause = armed[0]
                        armed[0] = False
                    if pause:
                        verified.set()
                        if not release.wait(8):
                            raise RuntimeError('Password-race fixture did not resume')
                    return valid

                body = {'identifier': email, 'password': CUSTOMER_PASSWORD} if action == 'login' else {
                    'current_password': CUSTOMER_PASSWORD, 'password': stale_password}
                path = '/api/auth/login' if action == 'login' else '/api/account/' + action
                with patch.object(api.auth, 'verify_password', side_effect=pause_first):
                    with ThreadPoolExecutor(max_workers=1) as pool:
                        pending = pool.submit(delayed.request, 'POST', path, body)
                        try:
                            self.assertTrue(verified.wait(4), 'The old password must be verified first')
                            self.assertEqual(other.request('POST', '/api/account/password', {
                                'current_password': CUSTOMER_PASSWORD, 'password': latest_password})[0], 200)
                        finally:
                            release.set()
                        code, result = pending.result(timeout=8)
                self.assertIn(code, (401, 403), result)
                self.assertNotIn('recovery_key', result)
                self.assertEqual(delayed.request('GET', '/api/account/orders')[0], 401)
                fresh = Client(self.server.server_address[1])
                self.assertEqual(fresh.login(email, latest_password)[0], 200)
                self.assertEqual(fresh.login(email, stale_password)[0], 401)

    def test_password_change_revokes_other_sessions_and_requires_current_password(self):
        self.customer.register()
        other = Client(self.server.server_address[1])
        other.login('customer@example.test', CUSTOMER_PASSWORD)
        code, _ = self.customer.request('POST', '/api/account/password', {'current_password': 'Wrong password 2026', 'password': 'Updated password 2026'})
        self.assertEqual(code, 400)
        self.assertEqual(self.customer.request('POST', '/api/account/password', {'current_password': CUSTOMER_PASSWORD, 'password': 'Updated password 2026'})[0], 200)
        self.assertEqual(other.request('GET', '/api/account/orders')[0], 401)
        self.assertEqual(other.login('customer@example.test', CUSTOMER_PASSWORD)[0], 401)
        self.assertEqual(other.login('customer@example.test', 'Updated password 2026')[0], 200)

    def test_recovery_key_is_single_use_and_revokes_old_sessions(self):
        _, registered = self.customer.register()
        old_key = registered['recovery_key']
        client = Client(self.server.server_address[1])
        client.session()
        self.assertEqual(client.request('POST', '/api/auth/recover', {'identifier': 'customer@example.test', 'recovery_key': 'bad', 'password': 'Recovered password 2026'})[0], 400)
        code, recovered = client.request('POST', '/api/auth/recover', {'identifier': 'customer@example.test', 'recovery_key': old_key, 'password': 'Recovered password 2026'})
        self.assertEqual(code, 200)
        self.assertNotEqual(old_key, recovered['recovery_key'])
        self.assertEqual(self.customer.request('GET', '/api/account/orders')[0], 401)
        self.assertEqual(client.request('POST', '/api/auth/recover', {'identifier': 'customer@example.test', 'recovery_key': old_key, 'password': 'Another password 2026'})[0], 400)

    def test_logout_others_and_logout_revoke_sessions(self):
        self.customer.register()
        other = Client(self.server.server_address[1])
        other.login('customer@example.test', CUSTOMER_PASSWORD)
        self.assertEqual(self.customer.request('POST', '/api/account/logout-others', {})[0], 200)
        self.assertEqual(other.request('GET', '/api/account/orders')[0], 401)
        self.assertEqual(self.customer.request('GET', '/api/account/orders')[0], 200)
        self.assertEqual(self.customer.request('POST', '/api/auth/logout', {})[1]['user'], None)
        self.assertEqual(self.customer.request('GET', '/api/account/orders')[0], 401)

    def test_customer_only_sees_own_orders_and_public_link_hides_identity(self):
        _, first = self.customer.register()
        _, owned = self.order(self.customer)
        other = Client(self.server.server_address[1])
        other.register('other@example.test')
        _, second = self.order(other)
        code, orders = self.customer.request('GET', '/api/account/orders')
        self.assertEqual(code, 200)
        self.assertEqual([o['id'] for o in orders], [owned['id']])
        self.assertEqual(self.customer.request('GET', '/api/account/orders/' + str(second['id']))[0], 404)
        guest = Client(self.server.server_address[1])
        code, public = guest.request('GET', '/api/orders/' + str(owned['id']) + '?token=' + owned['tracking_token'])
        self.assertEqual(code, 200)
        for field in ['customer', 'customer_id', 'identifier', 'name']:
            self.assertNotIn(field, public)

    def test_guest_claim_requires_secret_and_cannot_claim_another_customers_order(self):
        guest = Client(self.server.server_address[1])
        _, order = self.order(guest)
        self.customer.register()
        claim = {'id': order['id'], 'tracking_token': order['tracking_token']}
        self.assertEqual(self.customer.request('POST', '/api/account/orders/claim', {**claim, 'tracking_token': 'wrong'})[0], 404)
        self.assertEqual(self.customer.request('POST', '/api/account/orders/claim', claim)[0], 200)
        self.assertEqual(self.customer.request('GET', '/api/account/orders')[1][0]['id'], order['id'])
        another = Client(self.server.server_address[1])
        another.register('another@example.test')
        self.assertEqual(another.request('POST', '/api/account/orders/claim', claim)[0], 404)

    def test_checkout_snapshot_never_assigns_other_identity_or_reveals_receipt(self):
        _, user = self.customer.register()
        uid = user['user']['id']
        key = 'account-checkout-snapshot-key'
        code, order = self.order(self.customer, account_id=uid, idempotency_key=key)
        self.assertEqual(code, 201)
        self.assertEqual(self.order(self.customer, account_id=uid, idempotency_key=key)[1], order)
        guest = Client(self.server.server_address[1])
        self.assertEqual(self.order(guest, account_id=uid, idempotency_key=key)[0], 401)
        another = Client(self.server.server_address[1])
        another.register('another@example.test')
        self.assertEqual(self.order(another, account_id=uid, idempotency_key=key)[0], 409)
        self.assertEqual(self.order(another, idempotency_key=key)[0], 409)

    def test_administrator_edits_prices_and_blocks_customers(self):
        _, registered = self.customer.register()
        self.admin.login('admin', ADMIN_PASSWORD)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'name': 'Koszulka klubowa', 'price': 9900})[0], 200)
        self.assertEqual(self.customer.request('GET', '/api/catalog/1')[1]['price'], 9900)
        for price in [-1, 1.2, True]:
            self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1', {'name': 'Koszulka', 'price': price})[0], 400)
        uid = registered['user']['id']
        self.assertEqual(self.admin.request('GET', '/api/admin/customers')[1][0]['id'], uid)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/customers/' + str(uid), {'active': False})[0], 200)
        self.assertEqual(self.customer.request('GET', '/api/account/orders')[0], 401)
        self.assertEqual(self.customer.login('customer@example.test', CUSTOMER_PASSWORD)[0], 401)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/customers/' + str(uid), {'active': True})[0], 200)
        self.assertEqual(self.customer.login('customer@example.test', CUSTOMER_PASSWORD)[0], 200)

    def test_bootstrap_does_not_reset_administrator_password_on_restart(self):
        self.assertEqual(self.admin.login('admin', ADMIN_PASSWORD)[0], 200)
        self.assertEqual(self.admin.request('POST', '/api/staff/auth/password', {'current_password': ADMIN_PASSWORD, 'password': 'Changed admin password 2026'})[0], 200)
        api.init()
        another = Client(self.server.server_address[1])
        self.assertEqual(another.login('admin', ADMIN_PASSWORD)[0], 401)
        self.assertEqual(another.login('admin', 'Changed admin password 2026')[0], 200)

    def test_expired_session_loses_authorization(self):
        self.customer.register()
        with api.connect() as c:
            c.execute('UPDATE auth_sessions SET expires=?', (int(time.time()) - 1,))
        self.assertEqual(self.customer.request('GET', '/api/account/orders')[0], 401)

    def test_repeated_login_failures_are_limited(self):
        self.customer.session()
        statuses = [self.customer.request('POST', '/api/auth/login', {'identifier': 'missing@example.test', 'password': 'Wrong password 2026'})[0] for _ in range(9)]
        self.assertIn(429, statuses)


if __name__ == '__main__':
    unittest.main()
