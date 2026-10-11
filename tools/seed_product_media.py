"""Read-only preview / explicit additive import of the reviewed initial galleries.

Never initialize the commerce API here: its broader bootstrap is outside this
utility's scope. Only the two gallery tables may be created or written.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import commerce_media as media
import commerce_personalization as personalization

MANIFEST = ROOT / 'docs/product-media-sources.json'
SKUS = ('ZS-HD-001', 'ZS-HD-002', 'ZS-TS-003', 'ZS-TS-004', 'ZS-TS-005',
        'ZS-TS-006', 'ZS-TS-007', 'ZS-AC-008', 'ZS-KD-009', 'ZS-TS-010',
        'ZS-AC-011', 'ZS-AC-012')
HASH = re.compile('[0-9a-f]{64}')


def reviewed_products(manifest_path):
    """Validate identity, scope, truth labels and every deployed asset digest."""
    data = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    products = data.get('products')
    if data.get('schema_version') != 1 or not isinstance(products, list) or len(products) != 12:
        raise ValueError('Expected the reviewed 12-product manifest, schema version 1')
    for pid, product in enumerate(products, 1):
        cover = '/assets/photos/product-'+str(pid)+'.webp'
        if (type(product.get('product_id')) is not int or product['product_id'] != pid
                or product.get('expected_sku') != SKUS[pid-1]
                or product.get('expected_legacy_image') != (cover if pid == 1 else '')):
            raise ValueError('Manifest identity mismatch for product '+str(pid))
        assets = product.get('assets')
        if not isinstance(assets, list) or len(assets) != (3 if pid == 8 else 1):
            raise ValueError('Unapproved initial gallery scope for product '+str(pid))
        images = media.validate_images([asset['image'] for asset in assets])
        urls = [cover] + (['/assets/photos/gallery/product-8-detail.webp',
                           '/assets/photos/gallery/product-8-back.webp'] if pid == 8 else [])
        roles = ['packshot', 'detail', 'packshot'] if pid == 8 else ['packshot']
        ids = ['product-'+str(pid)+'-cover'] + (['product-8-detail', 'product-8-back'] if pid == 8 else [])
        for index, (asset, image) in enumerate(zip(assets, images)):
            classification = ('real_product_photograph' if pid in (8, 11, 12)
                              else 'official_illustrative_product_visual')
            if (image['url'] != urls[index] or image['role'] != roles[index] or image['id'] != ids[index]
                    or image['illustrative'] != (pid not in (8, 11, 12))
                    or asset.get('classification') != classification or not image['source_url']):
                raise ValueError('Unapproved image identity or truth label for product '+str(pid))
            if pid == 8 and index > 0:
                expected = ('20260430_121025-scaled.jpg' if index == 1
                            else '20260430_121140-removebg-preview.png')
                if image['source_url'] != 'https://zastal.store/wp-content/uploads/2026/04/'+expected:
                    raise ValueError('Unapproved additional bag photograph')
            for key in ('source_sha256', 'asset_sha256'):
                if not isinstance(asset.get(key), str) or not HASH.fullmatch(asset[key]):
                    raise ValueError('Missing or invalid '+key)
            file = ROOT / 'storefront/public' / image['url'].lstrip('/')
            if hashlib.sha256(file.read_bytes()).hexdigest() != asset['asset_sha256']:
                raise ValueError('Asset SHA256 mismatch: '+image['url'])
    return products


def seed_database(database, *, apply=False, approve_production_write=False, manifest_path=MANIFEST):
    """All catalogue checks and saves use a single locked transaction on apply.

    The approval flag is required for every write, so an unusual production path
    can never be misclassified as an isolated copy. Dry-run uses SQLite mode=ro.
    """
    if apply and not approve_production_write:
        raise PermissionError('--apply requires --approve-production-write after backup/copy review')
    products = reviewed_products(manifest_path)
    database = Path(database).resolve(strict=True)
    conn = sqlite3.connect(database.as_uri()+('?mode=rw' if apply else '?mode=ro'), uri=True, timeout=20)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        if apply:
            media.init_schema(conn)
        has_gallery = bool(conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_galleries'").fetchone())
        result = {'mode': 'apply' if apply else 'dry-run', 'seeded': [], 'skipped': []}
        for product in products:
            pid = product['product_id']
            row = conn.execute('SELECT sku FROM products WHERE id=?', (pid,)).fetchone()
            if not row or row['sku'] != product['expected_sku']:
                raise ValueError('Catalogue SKU mismatch or missing product: '+str(pid))
            if personalization.product_options(conn, pid)['image'] != product['expected_legacy_image']:
                raise ValueError('Legacy image mismatch for product '+str(pid))
            state = media.get(conn, pid) if has_gallery else {'images': [], 'revision': 0}
            if state['revision'] > 0 or state['images']:
                result['skipped'].append(pid)
                continue
            if apply:
                media.save(conn, pid, {'images': [asset['image'] for asset in product['assets']],
                                       'expected_revision': 0})
            result['seeded'].append(pid)
        if apply:
            conn.commit()
        else:
            conn.rollback()
        return result
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path, help='Existing SQLite database; no implicit live path')
    parser.add_argument('--apply', action='store_true', help='Write reviewed galleries; default is read-only preview')
    parser.add_argument('--approve-production-write', action='store_true',
                        help='Explicit operator approval after backup and isolated-copy verification; required for every --apply')
    args = parser.parse_args(argv)
    try:
        result = seed_database(args.database, apply=args.apply,
                               approve_production_write=args.approve_production_write)
    except (ValueError, KeyError, TypeError, OSError, sqlite3.Error) as error:
        parser.exit(1, 'Gallery seed refused: '+str(error)+'\n')
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
