"""Staff roles and capabilities are enforced server-side on isolated databases only."""
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
import commerce_api as api
import commerce_auth as auth
from http_client import Client

ADMIN_PASSWORD = 'Fixture admin password 2026'
STAFF_PASSWORD = 'Staff member password 2026'


class StaffTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'staff.sqlite3'
        api.TOKEN = ADMIN_PASSWORD
        api.LIMITS.clear()
        auth.clear_limits()
        api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products VALUES(1,'Koszulka','TS','Koszulki',7900,25)")
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.port = self.server.server_address[1]
        self.admin = Client(self.port)
        self.assertEqual(self.admin.login('admin', ADMIN_PASSWORD)[0], 200)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def create(self, identifier, role):
        code, data = self.admin.request('POST', '/api/admin/staff', {
            'identifier': identifier, 'name': identifier.title(), 'role': role, 'password': STAFF_PASSWORD})
        self.assertEqual(code, 201, data)
        client = Client(self.port)
        self.assertEqual(client.login(identifier, STAFF_PASSWORD)[0], 200)
        return data, client

    def test_admin_session_lists_capabilities_and_creates_staff(self):
        code, session = self.admin.session()
        self.assertEqual(session['user']['role'], 'admin')
        self.assertIn('staff', session['user']['capabilities'])
        data, cashier = self.create('kasa1', 'cashier')
        self.assertEqual(data['role_label'], 'Kasjer')
        self.assertEqual(cashier.session()[1]['user']['capabilities'], sorted(auth.ROLE_CAPABILITIES['cashier']))
        code, listing = self.admin.request('GET', '/api/admin/staff')
        self.assertEqual(code, 200)
        self.assertEqual([row['identifier'] for row in listing['staff']], ['admin', 'kasa1'])
        self.assertNotIn('password_hash', str(listing))
        code, _ = self.admin.request('POST', '/api/admin/staff', {'identifier': 'kasa1', 'name': 'X', 'role': 'cashier', 'password': STAFF_PASSWORD})
        self.assertEqual(code, 409)
        code, _ = self.admin.request('POST', '/api/admin/staff', {'identifier': 'zly', 'name': 'X', 'role': 'customer', 'password': STAFF_PASSWORD})
        self.assertEqual(code, 400)

    def test_capabilities_limit_routes_per_role(self):
        _, cashier = self.create('kasa', 'cashier')
        _, warehouse = self.create('magazyn', 'warehouse')
        _, manager = self.create('kierownik', 'manager')
        # Shared operational reads are open to every staff account.
        self.assertEqual(cashier.request('GET', '/api/admin/products')[0], 200)
        self.assertEqual(warehouse.request('GET', '/api/admin/orders')[0], 200)
        # Writes need the matching capability.
        variant = api.connect().execute('SELECT id FROM product_variants LIMIT 1').fetchone()['id']
        code, data = cashier.request('PATCH', '/api/admin/inventory/' + str(variant), {'delta': 1, 'reason': 'test'})
        self.assertEqual((code, data['code']), (403, 'capability_required'))
        self.assertEqual(warehouse.request('PATCH', '/api/admin/inventory/' + str(variant), {'delta': 1, 'reason': 'test'})[0], 200)
        self.assertEqual(warehouse.request('GET', '/api/admin/customers')[0], 403)
        self.assertEqual(cashier.request('GET', '/api/admin/customers')[0], 200)
        self.assertEqual(cashier.request('GET', '/api/admin/activity')[0], 403)
        self.assertEqual(cashier.request('GET', '/api/admin/email')[0], 403)
        self.assertEqual(manager.request('GET', '/api/admin/email')[0], 200)
        self.assertEqual(manager.request('GET', '/api/admin/staff')[0], 403)
        self.assertEqual(manager.request('GET', '/api/admin/launch')[0], 403)
        self.assertEqual(manager.request('GET', '/api/admin/home')[0], 200)
        customer = Client(self.port)
        self.assertEqual(customer.register()[0], 201)
        self.assertEqual(customer.request('GET', '/api/admin/products')[0], 403)

    def test_cashier_can_record_pos_sale_and_warehouse_cannot(self):
        _, cashier = self.create('kasa', 'cashier')
        _, warehouse = self.create('magazyn', 'warehouse')
        payload = {'items': [{'id': 1, 'size': 'L', 'quantity': 1}], 'idempotency_key': 'staff-pos-sale-key-0001',
                   'payment_method': 'cash', 'payment_confirmed': True}
        self.assertEqual(warehouse.request('POST', '/api/admin/pos/sales', payload)[0], 403)
        code, sale = cashier.request('POST', '/api/admin/pos/sales', payload)
        self.assertEqual(code, 201, sale)
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT actor_id FROM pos_sales WHERE order_id=?', (sale['id'],)).fetchone()[0],
                             cashier.session()[1]['user']['id'])

    def test_updates_revoke_sessions_and_protect_last_admin(self):
        data, cashier = self.create('kasa', 'cashier')
        code, updated = self.admin.request('PATCH', '/api/admin/staff/' + str(data['id']), {'role': 'warehouse'})
        self.assertEqual((code, updated['role']), (200, 'warehouse'))
        self.assertEqual(cashier.request('GET', '/api/admin/products')[0], 401)
        self.assertEqual(cashier.login('kasa', STAFF_PASSWORD)[0], 200)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/staff/' + str(data['id']), {'active': False})[0], 200)
        self.assertEqual(Client(self.port).login('kasa', STAFF_PASSWORD)[0], 401)
        me = self.admin.session()[1]['user']['id']
        self.assertEqual(self.admin.request('PATCH', '/api/admin/staff/' + str(me), {'active': False})[0], 409)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/staff/' + str(me), {'role': 'manager'})[0], 409)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/staff/' + str(data['id']), {'password': 'Replacement password 2026'})[0], 200)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/staff/' + str(data['id']), {'active': True})[0], 200)
        self.assertEqual(Client(self.port).login('kasa', 'Replacement password 2026')[0], 200)

    def test_legacy_users_table_is_migrated_without_losing_rows_or_sessions(self):
        self.server.shutdown()
        self.server.server_close()
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        api.DATABASE = Path(folder.name) / 'legacy.sqlite3'
        legacy = sqlite3.connect(api.DATABASE)
        legacy.executescript("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, identifier TEXT UNIQUE NOT NULL COLLATE NOCASE,
                name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','admin')),
                password_hash TEXT NOT NULL, recovery_hash TEXT, active INTEGER NOT NULL DEFAULT 1,
                created TEXT NOT NULL, updated TEXT NOT NULL);
            CREATE TABLE auth_sessions (
                token_hash TEXT PRIMARY KEY, user_id INTEGER, csrf_token TEXT NOT NULL,
                created INTEGER NOT NULL, expires INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
            INSERT INTO users VALUES(7,'admin','Administrator','admin','scrypt$x','rec',1,'2026-01-01','2026-01-01');
            INSERT INTO users VALUES(9,'kibic@example.test','Kibic','customer','scrypt$y',NULL,1,'2026-01-02','2026-01-02');
            INSERT INTO auth_sessions VALUES('hash-1',9,'csrf',1,9999999999);
        """)
        legacy.commit()
        legacy.close()
        api.init()
        with api.connect() as c:
            rows = c.execute('SELECT id,identifier,role,recovery_hash,email_verified FROM users ORDER BY id').fetchall()
            self.assertEqual([tuple(row) for row in rows], [(7, 'admin', 'admin', 'rec', 0), (9, 'kibic@example.test', 'customer', None, 0)])
            self.assertEqual(c.execute('SELECT user_id FROM auth_sessions').fetchone()[0], 9)
            c.execute("INSERT INTO users(identifier,name,role,password_hash,created,updated) VALUES('kasa','Kasa','cashier','x','2026','2026')")
            self.assertEqual(c.execute("SELECT sqlite_sequence.seq FROM sqlite_sequence WHERE name='users'").fetchone()[0], 10)
            self.assertTrue(c.execute("SELECT 1 FROM commerce_migrations WHERE name='staff-roles-2026-10-24'").fetchone())
        api.init()  # idempotent


if __name__ == '__main__':
    unittest.main()
