#!/usr/bin/env python3
"""Refresh a bounded batch of cached DPD statuses in the existing store database.

Credentials come only from the protected process environment. The worker emits
aggregate counters, never waybills, credentials, provider bodies or exceptions.
The API must initialize the additive tracking schema before the first run.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import commerce_dpd as dpd


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=Path(os.environ.get('ZASTAL_DB', str(Path(__file__).resolve().parents[1] / 'zastal.sqlite3'))))
    parser.add_argument('--limit', type=int, default=20, help='Maximum waybills per batch (1–100).')
    parser.add_argument('--once', action='store_true', help='Run one batch (the default).')
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error('Batch limit must be between 1 and 100.')
    if not args.database.is_file():
        parser.error('Existing database is required; initialize the API first.')
    try:
        result = dpd.run_once(args.database, args.limit)
    except (sqlite3.Error, OSError):
        print(json.dumps({'configured': dpd.configured(), 'error': 'database_unavailable'}), flush=True)
        return 1
    print(json.dumps(result), flush=True)
    return 0 if result['configured'] and not result['failed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
