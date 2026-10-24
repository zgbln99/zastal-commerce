"""DPD InfoServices SOAP tracking cache. Public reads never contact the carrier.

Contract: official INFO_Services_v2 PL §3.2.1.2 and live object-service WSDL/XSD
(downloaded 2026-10-24; provenance in .superpowers/legal-dpd/dpd-report.md).
Only logistics descriptions, codes and UTC timestamps are retained. Credentials,
SOAP bodies, recipient data and provider errors must never be stored or logged.
"""
from contextlib import closing
import datetime as dt
import json
import os
import re
import sqlite3
import unicodedata
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from zoneinfo import ZoneInfo

ENDPOINT = 'https://dpdinfoservices.dpd.com.pl/DPDInfoServicesObjEventsService/DPDInfoServicesObjEvents'
SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'
NAMESPACE = 'http://events.dpdinfoservices.dpd.com.pl/'
MAX_XML_BYTES = 1024 * 1024
MAX_EVENTS = 100
POLL_SECONDS = 15 * 60
FALLBACK_LABEL = 'Aktualny status sprawdzisz na stronie DPD'
# Exact codes from Kończące.xlsx in the official documentation bundle. Returns
# and readdressing close the original waybill; they do NOT mean delivered.
TERMINAL_CODES = frozenset(('190101','190102','190103','190104','190202','190203','190204',
    '501300','501304','501340','511901','511902','511903','600103','600104','701901',
    '701902','230402','230403','230408','230309'))
# These documented descriptions interpolate personal names / pickup point IDs.
# Keep the logistics portion of the official description, never its substitution.
PRIVATE_LABELS = {
    '511901': 'Przesyłka doręczona',
    '511902': 'Przesyłka doręczona - odebrano przesyłkę zwrotną',
    '511903': 'Przesyłka doręczona, odbiorca stwierdził uszkodzenie',
    '600101': 'Przyjęcie paczki w punkcie Pickup',
    '600102': 'Paczka oczekuje na odbiór własny w punkcie Strefy Paczki',
    '600103': 'Przesyłka doręczona',
    '600104': 'Przesyłka doręczona - odebrano przesyłkę zwrotną',
}


class DPDError(Exception):
    """A deliberately redacted carrier error."""


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='microseconds')


def valid_waybill(number):
    # Official PDF examples contain 13 digits followed by a checksum letter;
    # modern all-numeric 14-character waybills use the same safe URL format.
    return isinstance(number, str) and re.fullmatch(r'[0-9]{13}[0-9A-Z]', number) is not None


def tracking_url(number):
    return 'https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=' + number if valid_waybill(number) else ''


def configured():
    return bool(os.environ.get('ZASTAL_DPD_LOGIN', '').strip() and os.environ.get('ZASTAL_DPD_PASSWORD', ''))


def init_schema(c):
    """Add the cache and identity invalidation triggers during API initialization."""
    c.executescript('''
        CREATE TABLE IF NOT EXISTS dpd_shipments(
            order_id INTEGER PRIMARY KEY REFERENCES order_details(order_id) ON DELETE CASCADE,
            tracking_number TEXT NOT NULL,
            events TEXT NOT NULL DEFAULT '[]',
            checked_at TEXT,
            attempted_at TEXT,
            sync_state TEXT NOT NULL DEFAULT 'pending' CHECK(sync_state IN ('pending','ok','error')),
            terminal INTEGER NOT NULL DEFAULT 0,
            claim_token TEXT);
        CREATE TRIGGER IF NOT EXISTS dpd_identity_changed
        AFTER UPDATE OF tracking_number,carrier,mode ON order_details
        WHEN OLD.tracking_number IS NOT NEW.tracking_number OR OLD.carrier IS NOT NEW.carrier OR OLD.mode IS NOT NEW.mode
        BEGIN DELETE FROM dpd_shipments WHERE order_id=NEW.order_id; END;
        CREATE TRIGGER IF NOT EXISTS dpd_order_deleted AFTER DELETE ON order_details
        BEGIN DELETE FROM dpd_shipments WHERE order_id=OLD.order_id; END;
    ''')


def _one(c, query, args=()):
    cursor = c.execute(query, args)
    row = cursor.fetchone()
    return dict(zip([col[0] for col in cursor.description], row)) if row is not None else None


def public_shipment(c, oid):
    """Return only cached carrier information; caller must authorize the order."""
    details = _one(c, 'SELECT carrier,tracking_number,mode FROM order_details WHERE order_id=?', (oid,))
    if not details or details['mode'] != 'live' or details['carrier'].strip().upper() != 'DPD' or not details['tracking_number']:
        return None
    number = details['tracking_number']
    try:
        cache = _one(c, 'SELECT events,checked_at,sync_state FROM dpd_shipments WHERE order_id=? AND tracking_number=?', (oid, number))
    except sqlite3.OperationalError as error:
        # Historical standalone sales consumers may not have migrated the cache
        # yet. Public reads stay neutral and never perform schema writes.
        if str(error) != 'no such table: dpd_shipments':
            raise
        cache = None
    events = json.loads(cache['events']) if cache else []
    last = events[0] if events else {}
    state = cache['sync_state'] if cache else ('pending' if valid_waybill(number) else 'error')
    return {'carrier': 'DPD', 'tracking_number': number, 'tracking_url': tracking_url(number),
            'status_code': last.get('code'), 'status_label': last.get('label', FALLBACK_LABEL),
            'occurred_at': last.get('occurred_at'), 'checked_at': cache['checked_at'] if cache else None,
            'events': events, 'sync_state': state if configured() else 'not_configured',
            'source': 'dpd' if events else None}


def build_request(number, login, password, channel=''):
    if not valid_waybill(number):
        raise DPDError('invalid_waybill')
    envelope = ET.Element(ET.QName(SOAP, 'Envelope'))
    ET.SubElement(envelope, ET.QName(SOAP, 'Header'))
    body = ET.SubElement(envelope, ET.QName(SOAP, 'Body'))
    method = ET.SubElement(body, ET.QName(NAMESPACE, 'getEventsForWaybillV1'))
    for key, value in (('waybill', number), ('eventsSelectType', 'ALL'), ('language', 'PL')):
        ET.SubElement(method, key).text = value
    auth = ET.SubElement(method, 'authDataV1')
    if channel:
        ET.SubElement(auth, 'channel').text = channel
    ET.SubElement(auth, 'login').text = login
    ET.SubElement(auth, 'password').text = password
    return ET.tostring(envelope, encoding='utf-8', xml_declaration=True)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward SOAP credentials to another URL, including a redirect.
        raise DPDError('carrier_redirect')


def _transport(body):
    request = urllib.request.Request(ENDPOINT, data=body, method='POST',
        headers={'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""'})
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=10) as reply:
            raw = reply.read(MAX_XML_BYTES + 1)
        if len(raw) > MAX_XML_BYTES:
            raise DPDError('response_too_large')
        return raw
    except (urllib.error.URLError, OSError, TimeoutError):
        raise DPDError('carrier_unavailable') from None


TRANSPORT = _transport


def _event_time(value):
    try:
        if not value or 'T' not in value:
            raise ValueError()
        when = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        # DPD's published examples omit an offset. Treat Polish service local
        # timestamps as Europe/Warsaw (including DST), never as naive UTC.
        if when.tzinfo is None:
            when = when.replace(tzinfo=ZoneInfo('Europe/Warsaw'))
        return when.astimezone(dt.timezone.utc).isoformat()
    except (ValueError, OverflowError):
        raise DPDError('invalid_event_time') from None


def _label(code, description):
    if code in PRIVATE_LABELS:
        return PRIVATE_LABELS[code]
    # Unknown business codes retain the provider's logistics description. Ignore
    # recipient suffixes as a precaution if DPD introduces another interpolated code.
    description = re.split(r'\.?\s+Odbiorca\s*[: ]', description, maxsplit=1, flags=re.I)[0]
    description = ''.join(ch for ch in description if not unicodedata.category(ch).startswith('C'))
    return description.strip()[:500] or 'Zdarzenie DPD (' + code + ')'


def parse_response(raw, number):
    """Parse the documented V1 SOAP response, discarding all non-logistics data."""
    if not isinstance(raw, bytes) or len(raw) > MAX_XML_BYTES:
        raise DPDError('invalid_response')
    try:
        text = raw.decode('utf-8-sig')
        if '\x00' in text or '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
            raise DPDError('unsafe_xml')
        root = ET.fromstring(text)
    except (ET.ParseError, UnicodeError):
        raise DPDError('invalid_xml') from None
    body = root.find('{' + SOAP + '}Body')
    if root.tag != '{' + SOAP + '}Envelope' or body is None or body.find('{' + SOAP + '}Fault') is not None:
        raise DPDError('invalid_soap_response')
    result = body.find('{' + NAMESPACE + '}getEventsForWaybillV1Response/return')
    if result is None:
        raise DPDError('invalid_soap_response')
    events = []
    for item in result.findall('eventsList'):
        waybill = item.findtext('waybill', '')
        code = item.findtext('businessCode', '')
        if waybill != number or not re.fullmatch(r'[A-Za-z0-9_-]{1,32}', code):
            raise DPDError('invalid_event')
        events.append({'code': code, 'label': _label(code, item.findtext('description', '')),
                       'occurred_at': _event_time(item.findtext('eventTime', ''))})
    return _merge_events([], events)


def _merge_events(previous, received):
    unique = {(e['code'], e['occurred_at'], e['label']): e for e in previous + received}
    return sorted(unique.values(), key=lambda e: (dt.datetime.fromisoformat(e['occurred_at']), e['code'], e['label']), reverse=True)[:MAX_EVENTS]


def fetch_events(number):
    if not configured():
        raise DPDError('not_configured')
    body = build_request(number, os.environ['ZASTAL_DPD_LOGIN'], os.environ['ZASTAL_DPD_PASSWORD'], os.environ.get('ZASTAL_DPD_CHANNEL', ''))
    return parse_response(TRANSPORT(body), number)


def sync_pending(c, limit=20):
    """Sync one bounded batch using an idle, worker-owned SQLite connection.

    Never call from an HTTP request. Each claim and result is committed separately;
    provider I/O happens without a SQLite transaction. Invalidation triggers plus
    opaque per-attempt claims prevent stale results, including A -> B -> A changes.
    """
    if c.in_transaction:
        raise ValueError('DPD sync requires a connection without an open transaction')
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError('DPD batch limit must be between 1 and 100')
    summary = {'configured': configured(), 'selected': 0, 'updated': 0, 'failed': 0, 'superseded': 0}
    if not summary['configured']:
        return summary
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=POLL_SECONDS)).isoformat(timespec='microseconds')
    candidates = c.execute('''SELECT d.order_id,d.tracking_number FROM order_details d
        LEFT JOIN dpd_shipments s ON s.order_id=d.order_id AND s.tracking_number=d.tracking_number
        WHERE d.mode='live' AND upper(trim(d.carrier))='DPD'
          AND length(d.tracking_number)=14
          AND substr(d.tracking_number,1,13) NOT GLOB '*[^0-9]*'
          AND substr(d.tracking_number,14,1) GLOB '[0-9A-Z]'
          AND coalesce(s.terminal,0)=0 AND (s.attempted_at IS NULL OR s.attempted_at<=?)
        ORDER BY coalesce(s.attempted_at,''),d.order_id LIMIT ?''', (cutoff, limit)).fetchall()
    for oid, number in candidates:
        if not valid_waybill(number):
            continue
        token = uuid.uuid4().hex
        with c:
            c.execute('''INSERT OR IGNORE INTO dpd_shipments(order_id,tracking_number)
                SELECT order_id,tracking_number FROM order_details
                WHERE order_id=? AND tracking_number=? AND mode='live' AND upper(trim(carrier))='DPD' ''', (oid, number))
            claimed = c.execute('''UPDATE dpd_shipments SET claim_token=?,attempted_at=?
                WHERE order_id=? AND tracking_number=? AND terminal=0
                AND (attempted_at IS NULL OR attempted_at<=?)''', (token, stamp(), oid, number, cutoff)).rowcount
            previous = _one(c, 'SELECT events FROM dpd_shipments WHERE order_id=? AND claim_token=?', (oid, token))
        if not claimed or previous is None:
            continue
        summary['selected'] += 1
        try:
            received = fetch_events(number)
            events = _merge_events(json.loads(previous['events']), received)
            terminal = bool(events and events[0]['code'] in TERMINAL_CODES)
            now = stamp()
            with c:
                count = c.execute('''UPDATE dpd_shipments SET events=?,checked_at=?,sync_state='ok',terminal=?,claim_token=NULL
                    WHERE order_id=? AND tracking_number=? AND claim_token=?
                    AND EXISTS(SELECT 1 FROM order_details WHERE order_id=? AND tracking_number=? AND mode='live' AND upper(trim(carrier))='DPD')''',
                    (json.dumps(events, ensure_ascii=False), now, int(terminal), oid, number, token, oid, number)).rowcount
            summary['updated' if count else 'superseded'] += 1
        except (DPDError, OSError, TimeoutError):
            # Do not persist exception text or refresh checked_at after a failure.
            with c:
                count = c.execute("UPDATE dpd_shipments SET sync_state='error',claim_token=NULL WHERE order_id=? AND tracking_number=? AND claim_token=?", (oid, number, token)).rowcount
            summary['failed' if count else 'superseded'] += 1
    return summary


def run_once(database, limit=20):
    """Worker entry point: existing database path only; never creates/seeds a store."""
    path = Path(database).resolve()
    with closing(sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=5)) as c:
        c.execute('PRAGMA foreign_keys=ON')
        return sync_pending(c, limit)
