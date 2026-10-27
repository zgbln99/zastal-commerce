"""Initial media import safety against real isolated databases and files."""
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import commerce_api as api
import commerce_media as media

try:
    from tools import seed_product_media as seed
except ImportError:
    seed = None

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'docs/product-media-sources.json'
SKUS = ('ZS-HD-001', 'ZS-HD-002', 'ZS-TS-003', 'ZS-TS-004', 'ZS-TS-005',
        'ZS-TS-006', 'ZS-TS-007', 'ZS-AC-008', 'ZS-KD-009', 'ZS-TS-010',
        'ZS-AC-011', 'ZS-AC-012')


class SeedSafety(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(seed, 'Initial gallery seed utility is missing')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'catalog.sqlite3'
        previous = api.DATABASE, api.TOKEN
        api.DATABASE, api.TOKEN = self.db, ''
        try:
            api.init()
            with api.connect() as c:
                c.executemany('INSERT INTO products VALUES(?,?,?, ?,?,?)',
                              [(pid, 'Existing '+str(pid), sku, 'Akcesoria', 1200+pid, 21+pid)
                               for pid, sku in enumerate(SKUS, 1)])
                c.execute('INSERT INTO product_options(product_id,image,subtitle,personalization_enabled,personalization_required,personalization_fee) VALUES(1,?, ?,1,1,550)',
                          ('/assets/photos/product-1.webp', 'Existing subtitle'))
                c.execute("INSERT INTO product_options(product_id,image,subtitle,personalization_enabled,personalization_required,personalization_fee) VALUES(8,'','Bag subtitle',0,0,0)")
        finally:
            api.DATABASE, api.TOKEN = previous

    def connection(self):
        c = sqlite3.connect(self.db)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        return c

    def snapshot(self, galleries=True):
        with self.connection() as c:
            tables = [row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                      if not row[0].startswith('sqlite_') and (galleries or not row[0].startswith('product_galler'))]
            return {table: [tuple(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')]
                    for table in tables}

    def apply(self, **kwargs):
        return seed.seed_database(self.db, apply=True, approve_production_write=True, **kwargs)

    def changed_manifest(self, change):
        data = json.loads(MANIFEST.read_text())
        change(data)
        file = Path(self.tmp.name) / 'manifest.json'
        file.write_text(json.dumps(data))
        return file

    def test_default_dry_run_preserves_every_record_and_file(self):
        before, bytes_before = self.snapshot(), self.db.read_bytes()
        result = seed.seed_database(self.db)
        self.assertEqual(result, {'mode': 'dry-run', 'seeded': list(range(1, 13)), 'skipped': []})
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.db.read_bytes(), bytes_before)

    def test_apply_preserves_old_tables_and_records_canonical_verified_images(self):
        before = self.snapshot(galleries=False)
        self.assertEqual(self.apply()['seeded'], list(range(1, 13)))
        self.assertEqual(self.snapshot(galleries=False), before)
        with self.connection() as c:
            for pid in range(1, 13):
                gallery = media.get(c, pid)
                self.assertEqual(gallery['revision'], 1)
                self.assertEqual(len(gallery['images']), 3 if pid == 8 else 1)
                for image in gallery['images']:
                    self.assertEqual(set(image), media.REQUIRED | {'source_url'})
                    self.assertEqual(image['illustrative'], pid not in (8, 11, 12))
                    self.assertNotIn(image['role'], ('model', 'lifestyle'))
                self.assertEqual(gallery['images'][0]['url'], '/assets/photos/product-'+str(pid)+'.webp')
                self.assertEqual([(r['revision'], json.loads(r['images'])) for r in c.execute(
                    'SELECT revision,images FROM product_gallery_revisions WHERE product_id=? ORDER BY revision', (pid,))],
                    [(0, []), (1, gallery['images'])])

    def test_repeat_apply_is_idempotent_including_history_and_timestamps(self):
        self.apply()
        before = self.snapshot()
        self.assertEqual(self.apply(), {'mode': 'apply', 'seeded': [], 'skipped': list(range(1, 13))})
        self.assertEqual(self.snapshot(), before)

    def test_admin_edits_and_deliberately_empty_gallery_are_skipped(self):
        with self.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            image = {'id': 'manual', 'url': '/assets/photos/product-1.webp', 'role': 'packshot',
                     'alt': 'Admin decision', 'illustrative': False, 'source_url': ''}
            media.save(c, 1, {'images': [image], 'expected_revision': 0})
            media.save(c, 2, {'images': [], 'expected_revision': 0})
            before = [tuple(row) for row in c.execute('SELECT * FROM product_gallery_revisions')]
        result = self.apply()
        self.assertEqual(result['skipped'], [1, 2])
        with self.connection() as c:
            self.assertEqual(media.get(c, 1)['images'], [image])
            self.assertEqual(media.get(c, 2), {'images': [], 'revision': 1})
            self.assertEqual([tuple(row) for row in c.execute(
                'SELECT * FROM product_gallery_revisions WHERE product_id IN (1,2)')], before)

    def test_late_catalogue_sku_or_image_or_missing_product_mismatch_rolls_back(self):
        for statement in ("UPDATE products SET sku='DIFFERENT' WHERE id=12",
                          "INSERT INTO product_options(product_id,image) VALUES(12,'/assets/photos/product-12.webp')",
                          "DELETE FROM products WHERE id=12"):
            with self.subTest(statement=statement):
                with self.connection() as c:
                    c.execute(statement)
                before = self.snapshot()
                with self.assertRaises(ValueError):
                    self.apply()
                self.assertEqual(self.snapshot(), before)
                with self.connection() as c:
                    c.execute('DELETE FROM product_options WHERE product_id=12')
                    c.execute('INSERT OR REPLACE INTO products VALUES(12,?,?, ?,?,?)',
                              ('Existing 12', SKUS[-1], 'Akcesoria', 1212, 33))

    def test_modified_asset_sha_is_rejected_before_any_write(self):
        file = self.changed_manifest(lambda d: d['products'][-1]['assets'][0].update(asset_sha256='0'*64))
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.apply(manifest_path=file)
        self.assertEqual(self.snapshot(), before)

    def test_changed_packshot_bytes_are_rejected(self):
        local = Path(self.tmp.name) / 'release'
        data = json.loads(MANIFEST.read_text())
        for product in data['products']:
            for asset in product['assets']:
                path = Path('storefront/public') / asset['image']['url'].lstrip('/')
                (local / path).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / path, local / path)
        (local / 'storefront/public/assets/photos/product-12.webp').write_bytes(b'changed')
        previous = seed.ROOT
        seed.ROOT = local
        try:
            before = self.snapshot()
            with self.assertRaisesRegex(ValueError, 'Asset SHA256 mismatch'):
                self.apply()
            self.assertEqual(self.snapshot(), before)
        finally:
            seed.ROOT = previous

    def test_manifest_identity_and_truth_changes_are_rejected(self):
        changes = [lambda d: d['products'].pop(),
                   lambda d: d['products'][-1].update(expected_sku='DIFFERENT'),
                   lambda d: d['products'][1].update(expected_legacy_image='/assets/photos/product-2.webp'),
                   lambda d: d['products'][0]['assets'][0]['image'].update(illustrative=False),
                   lambda d: d['products'][0]['assets'][0]['image'].update(role='model')]
        for change in changes:
            with self.subTest(change=change):
                file = self.changed_manifest(change)
                before = self.snapshot()
                with self.assertRaises(ValueError):
                    self.apply(manifest_path=file)
                self.assertEqual(self.snapshot(), before)

    def test_apply_requires_explicit_production_approval_even_for_temp_database(self):
        before = self.snapshot()
        with self.assertRaises(PermissionError):
            seed.seed_database(self.db, apply=True)
        self.assertEqual(self.snapshot(), before)

    def test_missing_database_is_not_created(self):
        missing = Path(self.tmp.name) / 'missing.sqlite3'
        with self.assertRaises((FileNotFoundError, sqlite3.OperationalError)):
            seed.seed_database(missing)
        self.assertFalse(missing.exists())

    def test_dry_run_does_not_migrate_and_apply_adds_only_gallery_schema(self):
        with self.connection() as c:
            c.execute('DROP TABLE product_gallery_revisions')
            c.execute('DROP TABLE product_galleries')
        before = self.snapshot()
        seed.seed_database(self.db)
        self.assertEqual(self.snapshot(), before)
        self.apply()
        self.assertEqual(self.snapshot(galleries=False), before)

    def test_late_mismatch_rolls_back_new_gallery_schema_too(self):
        with self.connection() as c:
            c.execute('DROP TABLE product_gallery_revisions')
            c.execute('DROP TABLE product_galleries')
            c.execute("UPDATE products SET sku='DIFFERENT' WHERE id=12")
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.apply()
        self.assertEqual(self.snapshot(), before)

    def test_cli_defaults_to_preview_and_requires_both_apply_flags(self):
        command = [sys.executable, str(ROOT / 'tools/seed_product_media.py'), '--database', str(self.db)]
        before = self.snapshot()
        preview = subprocess.run(command, text=True, capture_output=True)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(json.loads(preview.stdout)['mode'], 'dry-run')
        self.assertEqual(self.snapshot(), before)
        refused = subprocess.run(command + ['--apply'], text=True, capture_output=True)
        self.assertEqual(refused.returncode, 1)
        self.assertIn('--approve-production-write', refused.stderr)
        self.assertEqual(self.snapshot(), before)
        approved = subprocess.run(command + ['--apply', '--approve-production-write'], text=True, capture_output=True)
        self.assertEqual(approved.returncode, 0, approved.stderr)
        self.assertEqual(json.loads(approved.stdout)['seeded'], list(range(1, 13)))


if __name__ == '__main__':
    unittest.main()
