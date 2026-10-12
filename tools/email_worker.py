#!/usr/bin/env python3
"""Deliver the existing SQLite email outbox, once or in a polling loop.

Requires SMTP and site-origin environment configuration. No schema seeding or
HTTP email delivery occurs. Queue state reports never contain message bodies.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import commerce_api as api
import commerce_email as email


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='Process one batch and exit (default).')
    parser.add_argument('--loop', action='store_true', help='Continue polling the existing outbox.')
    parser.add_argument('--limit', type=int, default=10, help='Maximum deliveries per batch (1–100).')
    parser.add_argument('--interval', type=float, default=15, help='Polling interval in seconds (1–60).')
    args = parser.parse_args()
    if args.once and args.loop:
        parser.error('Choose --once or --loop.')
    if not 1 <= args.limit <= 100 or not 1 <= args.interval <= 60:
        parser.error('Invalid batch limit or polling interval.')
    if not api.DATABASE.is_file():
        parser.error('Existing database is required; initialize the API first.')
    try:
        while True:
            result = email.process_outbox(api.connect, args.limit)
            print(json.dumps(result), flush=True)
            if not args.loop:
                return 0 if result['configured'] else 2
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
