#!/usr/bin/env python3
"""Periodic housekeeping: cancel unpaid live orders past the deadline and purge expired sessions/tokens.

Run from the systemd timer (deploy/zastal-store-maintenance.timer) or by hand:
  python3 tools/maintenance.py
Prints a JSON summary. Safe to run repeatedly; it never touches paid orders.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import commerce_api as api
import commerce_email as mail
import commerce_merch as merch
import commerce_retention as retention
import commerce_digest as digest
import commerce_cms as cms
import commerce_sales as sales


def main():
    if not api.DATABASE.is_file():
        raise SystemExit('Brak bazy danych; najpierw uruchom API.')
    with api.connect() as c:
        home_published = cms.run_due(c)
        c.execute('BEGIN IMMEDIATE')
        cancelled = sales.expire_unpaid(c)
        for oid in cancelled:
            mail.enqueue_order(c, oid, 'order_status_changed')
        restock_alerts = merch.notify_available(c)
        price_alerts = retention.notify_price_drops(c)
        cart_reminders = retention.remind_abandoned(c)
        digest_sent = digest.send_daily(c)
        now = int(time.time())
        sessions = c.execute('DELETE FROM auth_sessions WHERE expires<=?', (now,)).rowcount
        tokens = c.execute('DELETE FROM email_tokens WHERE expires<=? AND consumed IS NULL', (now - 7 * 86400,)).rowcount
    print(json.dumps({'cancelled_unpaid': cancelled, 'expired_sessions': sessions, 'expired_tokens': tokens, 'restock_alerts': restock_alerts, 'price_alerts': price_alerts, 'cart_reminders': cart_reminders, 'digest_sent_to': digest_sent, 'home_published': home_published}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
