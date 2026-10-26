#!/usr/bin/env python3
"""Consistent backups of the store database and CMS media, with restore verification.

  python3 tools/backup_sqlite.py --out /var/backups/zastal            # create <stamp>.sqlite3 + media tarball
  python3 tools/backup_sqlite.py --verify /var/backups/zastal/<file>   # restore into a temp dir and check it
  python3 tools/backup_sqlite.py --out ... --keep 30                  # prune older backups

Uses the SQLite online backup API, so the running API keeps serving. Never
writes to the live database. Secrets are not read or copied.
"""
import argparse
import datetime as dt
import os
import shutil
import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
TABLES = ('products', 'product_variants', 'orders', 'order_receipts', 'order_details', 'users', 'audit_log', 'stock_events')


def database_path():
    return Path(os.environ.get('ZASTAL_DB', str(ROOT / 'zastal.sqlite3'))).resolve()


def media_path():
    return Path(os.environ.get('ZASTAL_HOME_MEDIA', str(ROOT / 'home_media'))).resolve()


def create(out, keep):
    source = database_path()
    if not source.is_file():
        raise SystemExit(f'Brak bazy: {source}')
    out.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = out / f'zastal-{stamp}.sqlite3'
    live = sqlite3.connect(f'file:{source}?mode=ro', uri=True)
    copy = sqlite3.connect(target)
    with copy:
        live.backup(copy, pages=256)
    live.close()
    copy.close()
    os.chmod(target, 0o600)
    media = media_path()
    archive = None
    if media.is_dir():
        archive = out / f'zastal-media-{stamp}.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(media, arcname='home_media')
        os.chmod(archive, 0o600)
    summary = verify(target, quiet=True)
    print(f'backup: {target} ({target.stat().st_size // 1024} KB), media: {archive or "brak katalogu"}')
    print('integrity: ' + summary['integrity'] + ' · ' + ', '.join(f'{name}={count}' for name, count in summary['counts'].items()))
    if keep:
        prune(out, keep)
    return target


def prune(out, keep):
    for prefix in ('zastal-', 'zastal-media-'):
        files = sorted(path for path in out.iterdir() if path.name.startswith(prefix) and (path.suffix == '.sqlite3' if prefix == 'zastal-' else path.name.endswith('.tar.gz')))
        files = [path for path in files if (prefix == 'zastal-media-') == path.name.startswith('zastal-media-')]
        for old in files[:-keep]:
            old.unlink()
            print('usunięto stary backup: ' + old.name)


def verify(backup, quiet=False):
    """Restore the backup into a temporary directory, run integrity_check and initialise the schema."""
    with tempfile.TemporaryDirectory() as folder:
        restored = Path(folder) / 'restored.sqlite3'
        shutil.copy2(backup, restored)
        c = sqlite3.connect(restored)
        integrity = c.execute('PRAGMA integrity_check').fetchone()[0]
        counts = {}
        for table in TABLES:
            try:
                counts[table] = c.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            except sqlite3.OperationalError:
                counts[table] = 'brak'
        c.close()
        if integrity != 'ok':
            raise SystemExit('Backup uszkodzony: ' + integrity)
        os.environ['ZASTAL_DB'] = str(restored)
        os.environ.setdefault('ZASTAL_ADMIN_TOKEN', 'restore-check')
        import commerce_api as api
        api.DATABASE = restored
        api.init()
        if not quiet:
            print(f'restore-test OK: {backup} → schema aktualna, integrity {integrity}')
            print(', '.join(f'{name}={count}' for name, count in counts.items()))
        return {'integrity': integrity, 'counts': counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, help='Katalog na kopie zapasowe')
    parser.add_argument('--keep', type=int, default=0, help='Zachowaj tylko N najnowszych kopii')
    parser.add_argument('--verify', type=Path, help='Sprawdź istniejącą kopię (przywrócenie do katalogu tymczasowego)')
    args = parser.parse_args()
    if args.verify:
        verify(args.verify)
        return 0
    if not args.out:
        parser.error('Podaj --out lub --verify')
    create(args.out, args.keep)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
