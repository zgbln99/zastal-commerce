"""Email tests use temporary databases and an in-process SMTP substitute only."""
import importlib
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import threading
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
import commerce_auth as auth

PASSWORD = 'Email account password 2026'
SMTP_ENV = {'ZASTAL_SMTP_HOST': 'smtp.example.test', 'ZASTAL_SMTP_PORT': '587',
            'ZASTAL_SMTP_FROM': 'store@example.test', 'ZASTAL_SMTP_TLS': 'starttls',
            'ZASTAL_SITE_ORIGIN': 'https://store.example.test'}


class Handler:
    command = 'POST'
    client_address = ('127.0.0.1', 12345)

    def __init__(self):
        self.headers = {}
        self.response_headers = []
        self.data = {}
        self.reply = None

    def body(self):
        return self.data

    def respond(self, status, data):
        self.reply = (status, data)


class SMTP:
    messages = []

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def starttls(self, **kwargs):
        pass

    def ehlo(self):
        pass

    def login(self, *args):
        pass

    def send_message(self, message):
        self.messages.append(message)
        return {}


class EmailTests(unittest.TestCase):
    def test_order_delivery_discloses_demo_and_nonfiscal_payment_status(self):
        self.c.executescript('CREATE TABLE orders(id INTEGER PRIMARY KEY,status TEXT,total INTEGER); CREATE TABLE order_receipts(order_id INTEGER PRIMARY KEY,customer_id INTEGER);')
        self.c.execute("INSERT INTO orders VALUES(10,'nowe',7900)")
        self.c.execute('INSERT INTO order_receipts VALUES(10,?)',(self.user['id'],))
        self.email.enqueue_order(self.c,10);self.c.commit()
        with patch.dict(os.environ,SMTP_ENV),patch('commerce_email.smtplib.SMTP',SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['sent'],1)
        self.assertIn('testowe',str(SMTP.messages[0]['Subject']))
        body=self.email.plain_text(SMTP.messages[0])
        self.assertIn('demonstracyjna',body)
        self.assertIn('niefiskalny',body)
        self.assertIn('nie potwierdza rzeczywistej płatności',body)

    def test_staff_test_message_is_queued_and_smtp_status_is_recorded(self):
        self.c.execute("UPDATE users SET role='admin' WHERE id=?", (self.user['id'],))
        self.c.commit()
        self.h.request_user = self.c.execute('SELECT * FROM users').fetchone()
        result = self.request('/api/admin/email/test', {'recipient': 'check@example.test'})
        self.assertEqual(result[0], 200)
        self.assertEqual(self.c.execute('SELECT status FROM email_outbox').fetchone()[0], 'pending')
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['sent'], 1)
        self.assertEqual(SMTP.messages[0]['To'], 'check@example.test')
        self.assertIn('test poczty', str(SMTP.messages[0]['Subject']))
        self.assertEqual(self.email.admin_status(self.c)['messages'][0]['status'], 'sent')
        self.h.headers.pop('X-CSRF-Token')
        self.assertEqual(self.request('/api/admin/email/test', {'recipient': 'check@example.test'})[0], 403)

    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('commerce_email'), 'email subsystem must exist')
        self.email = importlib.import_module('commerce_email')
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'email.sqlite3'
        self.c = self.connect()
        auth.init_schema(self.c, '')
        self.email.init_schema(self.c)
        self.c.execute("INSERT INTO users(identifier,name,role,password_hash,recovery_hash,created,updated) VALUES(?,?,'customer',?,?,datetime('now'),datetime('now'))",
                       ('customer@example.test', 'Customer', auth.hash_password(PASSWORD), auth.digest('recovery-key')))
        self.user = self.c.execute('SELECT * FROM users').fetchone()
        self.h = Handler()
        auth.rotate(self.h, self.c, None)
        self.c.commit()
        self.h.headers['X-CSRF-Token'] = self.h.request_session['csrf_token']
        auth.clear_limits()
        SMTP.messages = []
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()

    def tearDown(self):
        if hasattr(self, 'env'):
            self.env.stop()
        if hasattr(self, 'c'):
            self.c.close()
            self.folder.cleanup()

    def connect(self):
        c = sqlite3.connect(self.path, timeout=5)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        return c

    def request(self, path, data=None, method='POST'):
        self.h.command = method
        self.h.data = data or {}
        try:
            handled = self.email.dispatch(self.h, path, self.c)
            self.assertTrue(handled)
            return self.h.reply
        except auth.AuthError as ex:
            self.c.rollback()
            return ex.status, {'code': ex.code, 'error': str(ex)}

    def token(self, kind):
        value = self.email._issue_token(self.c, self.user, kind)
        self.c.commit()
        return value

    def test_reset_request_is_nonenumerating_and_never_queues_admin(self):
        responses = [self.request('/api/auth/password-reset/request', {'email': address})
                     for address in ('customer@example.test', 'unknown@example.test')]
        self.assertEqual(responses, [(200, {'ok': True}), (200, {'ok': True})])
        self.c.execute("UPDATE users SET role='admin' WHERE id=?", (self.user['id'],))
        self.c.commit()
        self.assertEqual(self.request('/api/auth/password-reset/request', {'email': 'customer@example.test'}), responses[0])
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM email_outbox').fetchone()[0], 1)

    def test_expired_and_reused_tokens_are_rejected(self):
        token = self.token('password_reset')
        self.c.execute('UPDATE email_tokens SET expires=?', (int(time.time()) - 1,))
        self.c.commit()
        self.assertEqual(self.request('/api/auth/password-reset/confirm', {'token': token, 'password': PASSWORD})[0], 400)
        token = self.token('password_reset')
        self.assertEqual(self.request('/api/auth/password-reset/confirm', {'token': token, 'password': 'New account password 2026'}), (200, {'ok': True}))
        self.assertEqual(self.request('/api/auth/password-reset/confirm', {'token': token, 'password': PASSWORD})[0], 400)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM auth_sessions WHERE user_id=?', (self.user['id'],)).fetchone()[0], 0)
        self.assertIsNone(self.h.request_user)

    def test_old_tokens_do_not_survive_credential_change(self):
        token = self.token('password_reset')
        self.c.execute('UPDATE users SET password_hash=? WHERE id=?', (auth.hash_password('Changed account password 2026'), self.user['id']))
        self.c.commit()
        self.assertEqual(self.request('/api/auth/password-reset/confirm', {'token': token, 'password': PASSWORD})[0], 400)

    def test_verify_is_one_use_and_only_hash_is_persisted(self):
        token = self.token('email_verification')
        row = dict(self.c.execute('SELECT * FROM email_tokens').fetchone())
        self.assertNotIn(token, json.dumps(row))
        self.assertEqual(self.request('/api/auth/email/verify', {'token': token}), (200, {'ok': True}))
        self.assertEqual(self.c.execute('SELECT email_verified FROM users').fetchone()[0], 1)
        self.assertEqual(self.request('/api/auth/email/verify', {'token': token})[0], 400)

    def test_missing_smtp_keeps_queue_pending_and_metadata_has_no_payload(self):
        self.email.queue_verification(self.c, self.user)
        self.c.commit()
        result = self.email.process_outbox(self.connect)
        self.assertEqual(result['sent'], 0)
        row = self.c.execute('SELECT * FROM email_outbox').fetchone()
        self.assertEqual(row['status'], 'pending')
        self.assertEqual(row['attempts'], 0)
        status = self.email.admin_status(self.c)
        self.assertFalse(status['configuration']['configured'])
        listing = json.dumps(status['messages'])
        for value in ('customer@example.test', 'password_hash', 'token', 'https://', 'body'):
            self.assertNotIn(value, listing)

    def test_failure_is_retryable_without_exposing_exception_or_payload(self):
        self.email.queue_verification(self.c, self.user)
        self.c.commit()
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', side_effect=OSError('password=secret token=url')):
            result = self.email.process_outbox(self.connect)
        self.assertEqual(result['failed'], 1)
        row = self.c.execute('SELECT * FROM email_outbox').fetchone()
        self.assertEqual(row['status'], 'retry')
        self.assertEqual(row['attempts'], 1)
        self.assertGreater(row['next_attempt'], int(time.time()))
        self.assertNotIn('secret', json.dumps(self.email.admin_status(self.c)))

    def test_delivery_generates_fragment_link_and_scrubs_no_secret_to_database(self):
        self.email.queue_verification(self.c, self.user)
        self.c.commit()
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['sent'], 1)
        text = self.email.plain_text(SMTP.messages[0])
        self.assertIn('https://store.example.test/konto/email?action=verify#token=', text)
        token = text.split('#token=')[1].split()[0]
        self.assertNotIn(token, json.dumps([dict(r) for r in self.c.execute('SELECT * FROM email_outbox')]))
        self.assertEqual(self.request('/api/auth/email/verify', {'token': token})[0], 200)

    def test_admin_listing_retry_and_auth_mutations_require_authorization(self):
        self.email.queue_verification(self.c, self.user)
        self.c.commit()
        self.assertEqual(self.request('/api/admin/email', method='GET')[0], 401)
        self.h.headers.pop('X-CSRF-Token')
        self.assertEqual(self.request('/api/auth/password-reset/request', {'email': 'customer@example.test'})[0], 403)
        self.h.headers['X-CSRF-Token'] = self.h.request_session['csrf_token']
        self.assertEqual(self.request('/api/account/email/verification')[0], 401)
        self.h.request_user = self.user
        self.assertEqual(self.request('/api/admin/email', method='GET')[0], 403)

    def test_registration_queues_verification_and_password_change_cancels_tokens(self):
        self.h.data = {'email': 'new@example.test', 'name': 'New', 'password': PASSWORD}
        auth.dispatch(self.h, '/api/auth/register', self.c)
        self.assertEqual(self.h.reply[0], 201)
        self.assertFalse(self.h.reply[1]['user']['email_verified'])
        self.assertIn('recovery_key', self.h.reply[1])
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM email_outbox').fetchone()[0], 1)
        token = self.email._issue_token(self.c, self.h.request_user, 'password_reset')
        self.c.commit()
        self.h.headers['X-CSRF-Token'] = self.h.request_session['csrf_token']
        self.h.data = {'current_password': PASSWORD, 'password': 'Changed account password 2026'}
        auth.dispatch(self.h, '/api/account/password', self.c)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM email_tokens WHERE consumed IS NULL').fetchone()[0], 0)
        self.assertEqual(self.c.execute('SELECT status FROM email_outbox').fetchone()[0], 'cancelled')

    def test_active_lease_prevents_duplicate_worker_delivery(self):
        self.email.queue_verification(self.c, self.user)
        self.c.execute("UPDATE email_outbox SET status='sending',lease_until=?,lease_token='other'", (int(time.time()) + 100,))
        self.c.commit()
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['sent'], 0)
        self.assertEqual(SMTP.messages, [])

    def test_concurrent_token_consumption_allows_exactly_one_success(self):
        token = self.token('email_verification')
        def consume(_):
            c = self.connect()
            try:
                c.execute('BEGIN IMMEDIATE')
                self.email._consume_token(c, token, 'email_verification')
                c.commit()
                return True
            except auth.AuthError:
                c.rollback()
                return False
            finally:
                c.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(consume, range(2))), [False, True])

    def test_stale_queued_message_is_cancelled_before_delivery(self):
        self.email.queue_verification(self.c, self.user)
        self.c.execute('UPDATE users SET password_hash=? WHERE id=?', (auth.hash_password('Changed account password 2026'), self.user['id']))
        self.c.commit()
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['cancelled'], 1)
        self.assertEqual(SMTP.messages, [])
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM email_tokens').fetchone()[0], 0)

    def test_expired_lease_can_be_reclaimed_and_admin_can_retry_failed_mail(self):
        self.email.queue_verification(self.c, self.user)
        self.c.execute("UPDATE email_outbox SET status='sending',lease_until=?,lease_token='stale'", (int(time.time()) - 1,))
        self.c.commit()
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['sent'], 1)
        self.c.execute("UPDATE users SET role='admin' WHERE id=?", (self.user['id'],))
        self.c.execute("UPDATE email_outbox SET status='failed',attempts=6,last_error='smtp_delivery_failed'")
        self.c.commit()
        self.h.request_user = self.c.execute('SELECT * FROM users').fetchone()
        self.assertEqual(self.request('/api/admin/email/retry', {'id': 1}), (200, {'ok': True}))
        row = self.c.execute('SELECT * FROM email_outbox').fetchone()
        self.assertEqual((row['status'], row['attempts']), ('pending', 0))
        self.h.headers.pop('X-CSRF-Token')
        self.assertEqual(self.request('/api/admin/email/retry', {'id': 1})[0], 403)

    def test_account_resend_rechecks_session_and_verified_account_does_not_queue(self):
        auth.rotate(self.h, self.c, self.user)
        self.c.commit()
        self.h.headers['X-CSRF-Token'] = self.h.request_session['csrf_token']
        self.assertEqual(self.request('/api/account/email/verification'), (200, {'ok': True}))
        self.c.execute('UPDATE users SET email_verified=1')
        self.c.commit()
        self.assertEqual(self.request('/api/account/email/verification'), (200, {'ok': True}))
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM email_outbox').fetchone()[0], 1)

    def test_recovery_key_change_invalidates_preexisting_email_tokens(self):
        token = self.token('password_reset')
        self.h.data = {'identifier': self.user['identifier'], 'recovery_key': 'recovery-key', 'password': 'Recovered account password 2026'}
        auth.dispatch(self.h, '/api/auth/recover', self.c)
        self.assertEqual(self.h.reply[0], 200)
        self.assertIn('recovery_key', self.h.reply[1])
        self.h.headers['X-CSRF-Token'] = self.h.request_session['csrf_token']
        self.assertEqual(self.request('/api/auth/password-reset/confirm', {'token': token, 'password': PASSWORD})[0], 400)

    def test_legacy_schema_migration_preserves_rows_and_is_idempotent(self):
        legacy = sqlite3.connect(':memory:')
        legacy.row_factory = sqlite3.Row
        legacy.execute("CREATE TABLE users(id INTEGER PRIMARY KEY, identifier TEXT,name TEXT,role TEXT,password_hash TEXT,recovery_hash TEXT,active INTEGER,created TEXT,updated TEXT)")
        legacy.execute("INSERT INTO users VALUES(42,'legacy@example.test','Legacy','customer','hash','key',1,'created','updated')")
        self.email.init_schema(legacy)
        self.email.init_schema(legacy)
        row = legacy.execute('SELECT * FROM users').fetchone()
        self.assertEqual((row['id'], row['password_hash'], row['recovery_hash'], row['email_verified']), (42, 'hash', 'key', 0))
        legacy.close()

    def test_order_queue_is_idempotent_and_requires_customer_owner(self):
        self.c.executescript("CREATE TABLE orders(id INTEGER PRIMARY KEY,status TEXT,total INTEGER); CREATE TABLE order_receipts(order_id INTEGER PRIMARY KEY,customer_id INTEGER);")
        self.c.execute("INSERT INTO orders VALUES(10,'nowe',15000)")
        self.c.execute('INSERT INTO order_receipts VALUES(10,?)', (self.user['id'],))
        self.email.enqueue_order(self.c, 10)
        self.email.enqueue_order(self.c, 10)
        self.c.commit()
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM email_outbox').fetchone()[0], 1)
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            self.assertEqual(self.email.process_outbox(self.connect)['sent'], 1)
        self.assertIn('150.00 PLN', self.email.plain_text(SMTP.messages[0]))
        self.c.execute("UPDATE users SET role='admin'")
        self.assertIsNone(self.email.enqueue_order(self.c, 10, 'order_status_changed'))
        self.c.commit()

    def test_configuration_does_not_accept_unencrypted_transport_or_leak_credentials(self):
        with patch.dict(os.environ, {**SMTP_ENV, 'ZASTAL_SMTP_USERNAME': 'private-user', 'ZASTAL_SMTP_PASSWORD': 'private-password'}):
            configuration = self.email.configuration()
            self.assertTrue(configuration['configured'])
            self.assertNotIn('private', json.dumps(configuration))
        with patch.dict(os.environ, {**SMTP_ENV, 'ZASTAL_SMTP_TLS': 'none'}):
            self.assertFalse(self.email.configuration()['configured'])
        self.assertEqual(self.request('/api/auth/email/status', method='GET'), (200, {'configured': False}))

    def test_resend_uses_fresh_message_id_so_new_links_are_not_deduplicated(self):
        with patch.dict(os.environ, SMTP_ENV), patch('commerce_email.smtplib.SMTP', SMTP):
            for _ in range(2):
                self.email.queue_verification(self.c, self.user)
                self.c.commit()
                self.assertEqual(self.email.process_outbox(self.connect)['sent'], 1)
        self.assertNotEqual(SMTP.messages[0]['Message-ID'], SMTP.messages[1]['Message-ID'])

    def test_malformed_smtp_configuration_does_not_echo_embedded_credentials(self):
        with patch.dict(os.environ, {**SMTP_ENV, 'ZASTAL_SMTP_HOST': 'smtp://private-user:private-password@example.test'}):
            config = self.email.configuration()
            self.assertFalse(config['configured'])
            self.assertNotIn('private', json.dumps(config))

    def test_worker_cli_without_smtp_reports_configuration_and_leaves_queue_pending(self):
        self.email.queue_verification(self.c, self.user)
        self.c.commit()
        result = subprocess.run([sys.executable, 'tools/email_worker.py', '--once'],
            cwd=Path(__file__).resolve().parents[1],
            env={'ZASTAL_DB': str(self.path), 'ZASTAL_TEST_MODE': 'isolated-only'},
            capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(json.loads(result.stdout)['sent'], 0)
        self.assertEqual(self.c.execute('SELECT status FROM email_outbox').fetchone()[0], 'pending')


class EmailHTTPTests(unittest.TestCase):
    def setUp(self):
        import commerce_api as api
        from http_client import Client
        self.api = api
        self.email = importlib.import_module('commerce_email')
        self.folder = tempfile.TemporaryDirectory()
        self.original_db, self.original_token = api.DATABASE, api.TOKEN
        api.DATABASE = Path(self.folder.name) / 'http-email.sqlite3'
        api.TOKEN = 'Email fixture admin password 2026'
        auth.clear_limits()
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True)
        self.thread.start()
        self.client = Client(self.server.server_address[1])
        self.admin = Client(self.server.server_address[1])
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.env.stop()
        self.api.DATABASE, self.api.TOKEN = self.original_db, self.original_token
        self.folder.cleanup()

    def test_http_reset_flow_rejects_old_sessions_and_does_not_auto_login(self):
        self.assertEqual(self.client.register(password=PASSWORD)[0], 201)
        self.assertEqual(self.client.request('POST', '/api/auth/password-reset/request', {'email': 'customer@example.test'})[0], 200)
        with self.api.connect() as c:
            user = c.execute("SELECT * FROM users WHERE role='customer'").fetchone()
            token = self.email._issue_token(c, user, 'password_reset')
        code, result = self.client.request('POST', '/api/auth/password-reset/confirm', {'token': token, 'password': 'HTTP reset account password 2026'})
        self.assertEqual((code, result), (200, {'ok': True}))
        self.assertIsNone(self.client.session()[1]['user'])
        self.assertEqual(self.client.login('customer@example.test', PASSWORD)[0], 401)
        self.assertEqual(self.client.login('customer@example.test', 'HTTP reset account password 2026')[0], 200)
        self.assertEqual(self.client.request('POST', '/api/auth/password-reset/confirm', {'token': token, 'password': PASSWORD})[0], 400)

    def test_http_verification_and_admin_metadata_enforce_csrf_and_roles(self):
        self.client.register(password=PASSWORD)
        self.assertEqual(self.client.request('GET', '/api/admin/email')[0], 401)
        self.assertEqual(self.client.request('POST', '/api/account/email/verification', {}, csrf=False)[0], 403)
        self.assertEqual(self.client.request('GET', '/api/auth/email/status'), (200, {'configured': False}))
        with self.api.connect() as c:
            user = c.execute("SELECT * FROM users WHERE role='customer'").fetchone()
            token = self.email._issue_token(c, user, 'email_verification')
        self.assertEqual(self.client.request('POST', '/api/auth/email/verify', {'token': token}, csrf=False)[0], 403)
        self.assertEqual(self.client.request('POST', '/api/auth/email/verify', {'token': token})[0], 200)
        self.assertTrue(self.client.session()[1]['user']['email_verified'])
        self.assertEqual(self.admin.login('admin', 'Email fixture admin password 2026')[0], 200)
        code, result = self.admin.request('GET', '/api/admin/email')
        self.assertEqual(code, 200)
        self.assertIn('messages', result)
        self.assertNotIn(token, json.dumps(result))
        self.assertEqual(self.admin.request('POST', '/api/admin/email/retry', {'id': 1}, csrf=False)[0], 403)


if __name__ == '__main__':
    unittest.main()
