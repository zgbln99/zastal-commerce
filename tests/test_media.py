"""Product media contract against real HTTP and temporary SQLite/media files."""
import base64
import io
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from PIL import Image, PngImagePlugin
import commerce_api as api
import commerce_cms as cms
from http_client import Client

PASSWORD = 'Product media admin password 2026'
ASSET = '/assets/photos/product-1.webp'


def image(identifier='cover', url=ASSET, **changes):
    return {'id': identifier, 'url': url, 'role': 'packshot', 'alt': 'Koszulka',
            'illustrative': True, 'source_url': '', **changes}


class MediaIntegration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous = api.DATABASE, api.TOKEN, cms.HOME_MEDIA
        api.DATABASE = Path(self.tmp.name) / 'media.sqlite3'
        api.TOKEN = PASSWORD
        cms.HOME_MEDIA = Path(self.tmp.name) / 'uploads'
        api.LIMITS.clear(); api.auth.clear_limits()
        with sqlite3.connect(api.DATABASE) as c:
            c.execute('CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,sku TEXT UNIQUE NOT NULL,category TEXT,price INTEGER NOT NULL,stock INTEGER NOT NULL DEFAULT 0)')
            c.execute("INSERT INTO products VALUES(1,'Old shirt','OLD','Koszulki',7900,25)")
            c.execute("INSERT INTO products VALUES(2,'No image','NONE','Akcesoria',900,8)")
        api.init()
        with api.connect() as c:
            c.execute('INSERT INTO product_options(product_id,image) VALUES(1,?)', (ASSET,))
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True).start()
        self.guest = Client(self.server.server_address[1])
        self.admin = Client(self.server.server_address[1])
        self.assertEqual(self.admin.login('admin', PASSWORD)[0], 200)

    def tearDown(self):
        self.server.shutdown(); self.server.server_close()
        api.DATABASE, api.TOKEN, cms.HOME_MEDIA = self.previous
        self.tmp.cleanup()

    def save(self, images, revision=0, **extra):
        return self.admin.request('PATCH', '/api/admin/products/1/gallery',
                                  {'images': images, 'expected_revision': revision, **extra})

    def snapshot(self, c):
        tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")
                  if not r[0].startswith(('product_galler', 'sqlite_'))]
        return {table: [tuple(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')]
                for table in tables}

    def test_health_reports_release_without_changing_prelaunch_flags(self):
        code, health = self.guest.request('GET', '/health')
        free = health.pop('disk_free_mb')
        self.assertGreater(free, 0)
        self.assertEqual((code, health), (200, {
            'ok': True, 'version': '0.11', 'sales_phase': 'prelaunch', 'accounts': True, 'cms': True, 'pos': True, 'email': True, 'payments': False, 'db_writable': True}))

    def test_additive_schema_does_not_mutate_existing_records(self):
        with api.connect() as c:
            tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertTrue({'product_galleries', 'product_gallery_revisions'} <= tables)
            c.execute('DROP TABLE product_gallery_revisions')
            c.execute('DROP TABLE product_galleries')
            before = self.snapshot(c)
            import commerce_media as media
            media.init_schema(c)
            self.assertEqual(self.snapshot(c), before)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM product_galleries').fetchone()[0], 0)
            foreign = c.execute('PRAGMA foreign_key_list(product_galleries)').fetchall()
            self.assertTrue(any(r['table'] == 'products' and r['from'] == 'product_id' for r in foreign))

    def test_public_fallback_and_compatibility_keep_current_product_image(self):
        for endpoint in ['/api/products', '/api/catalog', '/api/admin/products']:
            client = self.admin if '/admin/' in endpoint else self.guest
            code, products = client.request('GET', endpoint)
            self.assertEqual(code, 200)
            self.assertIn('images', products[0])
            self.assertEqual(products[0]['images'], [image('legacy-1', alt='Old shirt')])
            self.assertEqual(products[0]['gallery_revision'], 0)
            self.assertEqual(products[0]['image'], ASSET)
            self.assertEqual(products[1]['images'], [])
        with api.connect() as c:
            c.execute('UPDATE product_options SET image=? WHERE product_id=1', ('javascript:alert(1)',))
        self.assertEqual(self.guest.request('GET', '/api/catalog/1')[1]['images'], [])

    def test_order_metadata_conflict_and_history_preserve_full_states(self):
        before = self.guest.request('GET', '/api/catalog/1')[1]
        self.assertEqual(self.admin.request('GET', '/api/admin/products/1/gallery'), (200, {'images': [], 'revision': 0}))
        images = [image(), image('on-model', '/assets/photos/product-2.webp', role='model',
                                  alt='Koszulka na modelu', illustrative=False,
                                  source_url='https://example.test/exact-product')]
        self.assertEqual(self.save(images), (200, {'images': images, 'revision': 1}))
        changed = [dict(images[1], alt='Widok przodu'), dict(images[0], role='detail')]
        self.assertEqual(self.save(changed, 1), (200, {'images': changed, 'revision': 2}))
        self.assertEqual(self.save(images, 1)[0], 409)
        self.assertEqual(self.admin.request('GET', '/api/admin/products/1/gallery')[1], {'images': changed, 'revision': 2})
        public = self.guest.request('GET', '/api/catalog/1')[1]
        self.assertEqual(public['images'], changed)
        self.assertEqual(public['gallery_revision'], 2)
        for key in before:
            if key not in ('images', 'gallery_revision'): self.assertEqual(public[key], before[key])
        with api.connect() as c:
            revisions = [(r['revision'], json.loads(r['images'])) for r in c.execute('SELECT * FROM product_gallery_revisions ORDER BY id')]
            self.assertEqual(revisions, [(0, []), (1, images), (2, changed)])
            self.assertEqual(c.execute("SELECT COUNT(*) FROM audit_log WHERE kind='product-gallery'").fetchone()[0], 2)
        self.assertEqual(self.save([], 2)[1], {'images': [], 'revision': 3})
        self.assertEqual(self.guest.request('GET', '/api/catalog/1')[1]['images'], [image('legacy-1', alt='Old shirt')])
        self.assertTrue((api.ROOT / 'storefront/public' / ASSET.lstrip('/')).is_file())

    def test_concurrent_editors_accept_one_revision_and_keep_winner(self):
        second = Client(self.server.server_address[1])
        self.assertEqual(second.login('admin', PASSWORD)[0], 200)
        barrier = threading.Barrier(2)
        results = []
        def submit(client, entry):
            barrier.wait(timeout=5)
            result = client.request('PATCH', '/api/admin/products/1/gallery',
                                    {'images': [entry], 'expected_revision': 0})
            results.append((entry, result))
        threads = [threading.Thread(target=submit, args=(client, image(identifier)))
                   for client, identifier in [(self.admin, 'editor-a'), (second, 'editor-b')]]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=10)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(sorted(result[0] for _, result in results), [200, 409])
        winner = next(entry for entry, result in results if result[0] == 200)
        self.assertEqual(self.admin.request('GET', '/api/admin/products/1/gallery')[1],
                         {'images': [winner], 'revision': 1})
        with api.connect() as c:
            self.assertEqual([(r['revision'], json.loads(r['images'])) for r in
                              c.execute('SELECT * FROM product_gallery_revisions ORDER BY id')],
                             [(0, []), (1, [winner])])
            self.assertEqual(c.execute("SELECT COUNT(*) FROM audit_log WHERE kind='product-gallery'").fetchone()[0], 1)

    def test_invalid_gallery_is_atomic(self):
        invalid = [
            None, {}, [image(id='')], [image(id='x'*81)], [image(id='zażółć')],
            [image(url='/assets/../commerce_api.py')], [image(url='/assets/%2e%2e/private')],
            [image(url='/assets/photos/product-1.webp?x=1')], [image(url=ASSET+'#x')],
            [image(url='/assets/photos/missing.webp')], [image(url='/assets/photos')],
            [image(url='/assets//photos/product-1.webp')], [image(url='https://example.test/photo.webp')],
            [image(url='/api/store/media/'+'a'*32+'.webp')], [image(role='other')],
            [image(role=[])], [image(url=1)], [image(source_url=None)], [image(illustrative=1)], [image(illustrative='false')],
            [image(alt='x'*251)], [image(alt=3)], [image(alt='<script>x</script>')],
            [image(alt='x\x00')], [image(source_url='http://example.test/a')],
            [image(source_url='https://user:password@example.test/a')],
            [image(source_url='https://example.test/\nsecret')],
            [image(source_url='https://example.test/\x7fsecret')], [image(source_url='x'*401)],
            [image(unknown='bad')], [image(), image(url='/assets/photos/product-2.webp')], [image('other'), image()],
            [image(str(i), '/assets/photos/product-'+str(i)+'.webp') for i in range(21)],
        ]
        self.assertEqual(self.save([image()])[0], 200)
        for value in invalid:
            with self.subTest(value=value): self.assertEqual(self.save(value, 1)[0], 400)
        for revision in [True, -1, '1', None]:
            with self.subTest(revision=revision): self.assertEqual(self.save([], revision)[0], 400)
        self.assertEqual(self.save([image(illustrative=1)], 0)[0], 400)
        self.assertEqual(self.save([], 1, extra=True)[0], 400)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/1/gallery', {'images': []})[0], 400)
        self.assertEqual(self.admin.request('GET', '/api/admin/products/1/gallery')[1], {'images': [image()], 'revision': 1})
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM product_gallery_revisions').fetchone()[0], 2)

    def test_gallery_limit_with_twenty_one_distinct_existing_urls(self):
        with tempfile.TemporaryDirectory(dir=api.ROOT / 'storefront/public/assets') as folder:
            root = Path(folder)
            urls = []
            for index in range(21):
                file = root / (str(index)+'.webp')
                file.symlink_to(api.ROOT / 'storefront/public' / ASSET.lstrip('/'))
                urls.append('/assets/'+root.name+'/'+file.name)
            self.assertEqual(self.save([image(str(i), url) for i, url in enumerate(urls[:20])])[0], 200)
            self.assertEqual(self.save([image(str(i), url) for i, url in enumerate(urls)], 1)[0], 400)

    def test_asset_symlinks_cannot_escape_public_assets(self):
        link = api.ROOT / 'storefront/public/assets/media-test-escape.webp'
        outside = Path(self.tmp.name) / 'outside.webp'; outside.write_bytes(b'not an asset')
        link.symlink_to(outside)
        try: self.assertEqual(self.save([image(url='/assets/media-test-escape.webp')])[0], 400)
        finally: link.unlink()

    def test_access_csrf_origin_and_missing_product(self):
        path = '/api/admin/products/1/gallery'
        for method in ['GET', 'PATCH']:
            self.assertEqual(self.guest.request(method, path, {'images': [], 'expected_revision': 0} if method == 'PATCH' else None)[0], 401)
        customer = Client(self.server.server_address[1])
        self.assertEqual(customer.register(email='media-customer@example.test')[0], 201)
        self.assertEqual(customer.request('GET', path)[0], 401)
        self.assertEqual(customer.request('PATCH', path, {'images': [], 'expected_revision': 0})[0], 401)
        self.assertEqual(self.admin.request('PATCH', path, {'images': [], 'expected_revision': 0}, csrf=False)[0], 403)
        self.assertEqual(self.admin.request('PATCH', path, {'images': [], 'expected_revision': 0}, headers={'Origin': 'https://evil.test'})[0], 403)
        self.assertEqual(self.admin.request('PATCH', path, {'images': [], 'expected_revision': 0}, headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.admin.request('GET', '/api/admin/products/'+('9'*100)+'/gallery')[0], 404)
        self.assertEqual(self.admin.request('GET', '/api/admin/products/999/gallery')[0], 404)
        self.assertEqual(self.admin.request('PATCH', '/api/admin/products/999/gallery', {'images': [], 'expected_revision': 0})[0], 404)

    def test_optional_source_defaults_to_empty_and_metadata_writes_obey_json_limit(self):
        entry = image(); del entry['source_url']
        self.assertEqual(self.save([entry])[1], {'images': [image()], 'revision': 1})
        self.assertEqual(self.save([image(alt='x'*35000)], 1)[0], 400)
        self.assertEqual(self.admin.request('GET', '/api/admin/products/1/gallery')[1], {'images': [image()], 'revision': 1})

    def test_upload_formats_strip_metadata_and_reuse_gallery_route(self):
        for format_, mime in [('PNG', 'png'), ('JPEG', 'jpeg'), ('WEBP', 'webp')]:
            with self.subTest(format=format_):
                picture = Image.new('RGB', (620, 420), (15, 120, 75))
                buff = io.BytesIO()
                exif = Image.Exif(); exif[270] = 'secret metadata'
                metadata = PngImagePlugin.PngInfo(); metadata.add_text('Author', 'private author')
                options = {'pnginfo': metadata} if format_ == 'PNG' else {'exif': exif}
                picture.save(buff, format_, **options)
                code, result = self.admin.request('POST', '/api/admin/home/media', {
                    'image': 'data:image/'+mime+';base64,'+base64.b64encode(buff.getvalue()).decode(), 'name': 'photo.'+mime})
                self.assertEqual(code, 201)
                content = cms.load_media(result['url'].rsplit('/', 1)[-1])
                with Image.open(io.BytesIO(content)) as sanitized:
                    self.assertEqual(sanitized.format, 'WEBP')
                    self.assertFalse(sanitized.getexif()); self.assertNotIn('Author', sanitized.info)
                status, state = self.admin.request('GET', '/api/admin/products/1/gallery')
                self.assertEqual(status, 200)
                self.assertEqual(self.save([image(url=result['url'])], state['revision'])[0], 200)
        for payload in ['data:image/png;base64,bm90IGFuIGltYWdl', 'data:image/png;base64,'+'A'*1_850_001]:
            self.assertEqual(self.admin.request('POST', '/api/admin/home/media', {'image': payload, 'name': 'bad.png'})[0], 400)


if __name__ == '__main__': unittest.main()
