"""Information pages: seeded drafts stay private, publishing needs explicit review confirmation."""
import tempfile
import threading
import unittest
from pathlib import Path
import commerce_api as api
import commerce_auth as auth
from http_client import Client

ADMIN_PASSWORD = 'Fixture admin password 2026'


class PagesTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        api.DATABASE = Path(self.folder.name) / 'pages.sqlite3'
        api.TOKEN = ADMIN_PASSWORD
        api.LIMITS.clear()
        auth.clear_limits()
        api.init()
        api.init()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.port = self.server.server_address[1]
        self.admin = Client(self.port)
        self.assertEqual(self.admin.login('admin', ADMIN_PASSWORD)[0], 200)
        self.guest = Client(self.port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def test_seeded_drafts_are_private_until_reviewed_and_published(self):
        self.assertEqual(self.guest.request('GET', '/api/store/pages'), (200, []))
        self.assertEqual(self.guest.request('GET', '/api/store/pages/regulamin')[0], 404)
        code, drafts = self.admin.request('GET', '/api/admin/pages')
        self.assertEqual([page['slug'] for page in drafts], ['regulamin', 'polityka-prywatnosci', 'zwroty', 'dostawa', 'kontakt'])
        self.assertGreater(drafts[0]['placeholders'], 0)
        self.assertFalse(drafts[0]['published'])
        code, data = self.admin.request('POST', '/api/admin/pages/regulamin/publish', {})
        self.assertEqual((code, data['code']), (400, 'review_required'))
        code, saved = self.admin.request('PATCH', '/api/admin/pages/regulamin', {'title': 'Regulamin', 'content': '# Regulamin\n\nTreść zatwierdzona.\n\n- punkt pierwszy\n- [zasady](https://example.test/zasady)', 'revision': drafts[0]['revision']})
        self.assertEqual((code, saved['revision'], saved['placeholders']), (200, drafts[0]['revision'] + 1, 0), saved)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/pages/regulamin', {'content': 'x', 'revision': drafts[0]['revision']})[1]['code'], 'stale_revision')
        self.assertEqual(self.admin.request('PATCH', '/api/admin/pages/regulamin', {'content': '<script>alert(1)</script>'})[0], 400)
        code, published = self.admin.request('POST', '/api/admin/pages/regulamin/publish', {'confirm_reviewed': True, 'revision': saved['revision']})
        self.assertEqual((code, published['published'], published['published_revision']), (200, True, saved['revision']))
        code, page = self.guest.request('GET', '/api/store/pages/regulamin')
        self.assertEqual((code, page['title']), (200, 'Regulamin'))
        self.assertIn('Treść zatwierdzona', page['content'])
        self.assertEqual([page['slug'] for page in self.guest.request('GET', '/api/store/pages')[1]], ['regulamin'])
        self.assertEqual([page['slug'] for page in self.guest.request('GET', '/api/store/status')[1]['config']['pages']], ['regulamin'])
        # Editing the draft again does not change the public page until republished.
        self.admin.request('PATCH', '/api/admin/pages/regulamin', {'content': '# Nowy szkic'})
        self.assertIn('Treść zatwierdzona', self.guest.request('GET', '/api/store/pages/regulamin')[1]['content'])
        self.assertEqual(self.admin.request('POST', '/api/admin/pages/regulamin/unpublish', {})[1]['published'], False)
        self.assertEqual(self.guest.request('GET', '/api/store/pages/regulamin')[0], 404)
        code, created = self.admin.request('PATCH', '/api/admin/pages/faq', {'title': 'FAQ', 'content': 'Pytania i odpowiedzi.'})
        self.assertEqual((code, created['slug']), (200, 'faq'))
        self.assertEqual(self.admin.request('PATCH', '/api/admin/pages/Bad_Slug', {'title': 'x', 'content': 'y'})[0], 404)
        customer = Client(self.port)
        customer.register()
        self.assertEqual(customer.request('GET', '/api/admin/pages')[0], 403)


if __name__ == '__main__':
    unittest.main()
