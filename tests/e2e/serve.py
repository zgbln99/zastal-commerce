#!/usr/bin/env python3
"""Start an isolated live-mode store (API + built storefront) for browser E2E runs.

Everything lives in a temporary directory: SQLite, media, runtime env. PayU is
replaced by an in-process fake transport, SMTP is configured but never used
(the outbox worker is not started). Prints JSON with ports and credentials.
"""
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
ADMIN_PASSWORD = 'E2E admin password 2026'
STAFF_PASSWORD = 'E2E staff password 2026'


def seed(api, sales, auth):
    with api.connect() as c:
        for row in [
            (1, 'Bluza Zastal Logo', 'ZS-HD-001', 'Bluzy', 9900, 38), (2, 'Bluza Zastal Retro', 'ZS-HD-002', 'Bluzy', 9900, 19),
            (3, 'Koszulka Wicemistrz Polski', 'ZS-TS-003', 'Koszulki', 6500, 24), (4, 'Koszulka The Final ciemna', 'ZS-TS-004', 'Koszulki', 6000, 27),
            (5, 'Koszulka The Final jasna', 'ZS-TS-005', 'Koszulki', 6000, 17), (6, 'Koszulka Zastal Sulima', 'ZS-TS-006', 'Koszulki', 6000, 35),
            (7, 'Koszulka Zastal Express', 'ZS-TS-007', 'Koszulki', 5500, 25), (8, 'Worek sportowy Zastal', 'ZS-AC-008', 'Akcesoria', 5000, 42),
            (9, 'Koszulka dziecięca Wicemistrz', 'ZS-KD-009', 'Dzieci', 5500, 20), (10, 'Koszulka Zastal Trio', 'ZS-TS-010', 'Koszulki', 6000, 24),
            (11, 'Brelok Dziczek 3D', 'ZS-AC-011', 'Akcesoria', 3000, 60), (12, 'Magnes Zastal Dziczek', 'ZS-AC-012', 'Akcesoria', 2500, 45)]:
            c.execute('INSERT INTO products(id,name,sku,category,price,stock) VALUES(?,?,?,?,?,?)', row)
    api.init()
    with api.connect() as c:
        layout = json.dumps({'image': '/assets/photos/product-1.webp', 'areas': {'name': {'x': 30, 'y': 22, 'w': 40, 'h': 5}, 'number': {'x': 34, 'y': 30, 'w': 32, 'h': 18}}, 'color': '#ffffff', 'font': 'block', 'calibrated': False, 'note': ''})
        c.execute("INSERT INTO product_options(product_id,image,subtitle,personalization_enabled,personalization_required,personalization_fee,decoration_method,print_layout) VALUES(1,'/assets/photos/product-1.webp','Klasyczna bluza z kapturem • zieleń',1,0,2500,'dtf',?)", (layout,))
        for pid in range(2, 13):
            c.execute('INSERT INTO product_options(product_id,image,subtitle) VALUES(?,?,?)', (pid, f'/assets/photos/product-{pid}.webp', 'Kolekcja klubowa'))
        c.execute("UPDATE product_options SET preorder=1,preorder_note='Wysyłka od 20 listopada',preorder_until='2026-11-20',size_guide='116: dł. 44 cm\n128: dł. 48 cm\n140: dł. 52 cm',description='Koszulka dla najmłodszych kibiców.\n\n## Materiał i krój\n- Bawełna 100%\n- Rozmiary według wzrostu dziecka' WHERE product_id=9")
        c.execute("INSERT INTO promo_codes(code,kind,value,min_subtotal,created) VALUES('KIBIC10','percent',10,5000,'2026-10-24T00:00:00+00:00')")
        c.execute("UPDATE product_options SET badge='limitowana' WHERE product_id=2")
        import datetime as dt
        import commerce_pricing as pricing
        c.execute('UPDATE product_prices SET changed_at=? WHERE product_id=3', (pricing.stamp(dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=40)),))
        pricing.record(c, 3, 7900, moment=dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=12))
        pricing.record(c, 3, 6500)
        for key, value in {'seller_name': 'Zastal Zielona Góra S.A.', 'tax_id': '5260250995', 'business_address': 'ul. Sulechowska 41, 65-119 Zielona Góra',
                           'support_email': 'sklep@example.test', 'support_phone': '68 000 00 00', 'returns_address': 'ul. Sulechowska 41, 65-119 Zielona Góra',
                           'terms_url': 'https://store.example.test/regulamin', 'privacy_url': 'https://store.example.test/prywatnosc',
                           'returns_url': 'https://store.example.test/zwroty', 'shipping_url': 'https://store.example.test/dostawa',
                           'brand_approved': '1', 'catalog_reviewed': '1', 'inventory_counted': '1', 'supplier_confirmed': '1'}.items():
            c.execute('INSERT INTO launch_settings(key,value) VALUES(?,?)', (key, value))
        for key, value in {'transfer_enabled': '1', 'transfer_recipient': 'Zastal Zielona Góra S.A.', 'transfer_account': 'PL61109010140000071219812874',
                           'transfer_bank': 'Bank Przykładowy', 'pickup_payment_enabled': '1', 'payu_enabled': '1',
                           'pickup_address': 'Sklep klubowy, CRS, ul. Sulechowska 41, Zielona Góra', 'pickup_hours': 'pn–pt 10:00–18:00, dni meczowe od 16:00',
                           'fiscal_confirmed': '1'}.items():
            c.execute('INSERT INTO store_settings(key,value,changed_at) VALUES(?,?,?)', (key, value, sales.stamp()))
        c.execute("UPDATE shipping_methods SET enabled=1,carrier='InPost',tracking_url='https://inpost.pl/sledzenie-przesylek?number={tracking}' WHERE code IN ('kurier','paczkomat')")
        c.execute("INSERT INTO users(identifier,name,role,password_hash,created,updated) VALUES('kasa','Kasjer E2E','cashier',?,datetime('now'),datetime('now'))", (auth.hash_password(STAFF_PASSWORD),))
        c.commit()


def main():
    folder = tempfile.mkdtemp(prefix='zastal-e2e-')
    api_port, web_port = int(os.environ.get('E2E_API_PORT', '8880')), int(os.environ.get('E2E_WEB_PORT', '8878'))
    web_origin = f'http://127.0.0.1:{web_port}'
    env = {**os.environ, 'ZASTAL_DB': str(Path(folder) / 'e2e.sqlite3'), 'ZASTAL_ADMIN_TOKEN': ADMIN_PASSWORD,
           'ZASTAL_PORT': str(api_port), 'ZASTAL_SALES_MODE': 'live', 'ZASTAL_SITE_ORIGIN': 'https://store.example.test',
           'ZASTAL_ALLOWED_ORIGINS': web_origin, 'ZASTAL_SMTP_HOST': 'smtp.example.test', 'ZASTAL_SMTP_FROM': 'sklep@example.test',
           'ZASTAL_PAYU_POS_ID': '300746', 'ZASTAL_PAYU_CLIENT_ID': '300746', 'ZASTAL_PAYU_CLIENT_SECRET': 'e2e-secret',
           'ZASTAL_PAYU_SECOND_KEY': 'e2e-second-key', 'ZASTAL_PAYU_ENV': 'sandbox', 'ZASTAL_PAYU_FAKE': '1',
           'ZASTAL_TEST_MODE': ''}
    os.environ.update(env)
    import commerce_api as api
    import commerce_auth as auth
    import commerce_sales as sales
    api.DATABASE = Path(env['ZASTAL_DB'])
    api.TOKEN = ADMIN_PASSWORD
    api.init()
    seed(api, sales, auth)
    import commerce_payments as payments
    def fake_transport(method, url, headers, body):
        if url.endswith('/oauth/authorize'):
            return 200, {}, json.dumps({'access_token': 'e2e-token', 'expires_in': 3600}).encode()
        if url.endswith('/api/v2_1/orders'):
            payload = json.loads(body)
            return 302, {}, json.dumps({'status': {'statusCode': 'SUCCESS'}, 'redirectUri': f'https://payu.example.test/pay?payu-fake={payload["extOrderId"]}', 'orderId': 'PAYU-' + payload['extOrderId']}).encode()
        return 200, {}, json.dumps({'status': {'statusCode': 'SUCCESS'}, 'refund': {'refundId': 'RF-E2E', 'status': 'PENDING'}}).encode()
    payments.TRANSPORT = fake_transport
    server = api.ThreadingHTTPServer(('127.0.0.1', api_port), api.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    web = subprocess.Popen(['npx', 'next', 'start', '-H', '127.0.0.1', '-p', str(web_port)], cwd=ROOT / 'storefront', env={**env, 'ZASTAL_CMS_API': f'http://127.0.0.1:{api_port}'},
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    time.sleep(3)
    print(json.dumps({'folder': folder, 'api': f'http://127.0.0.1:{api_port}', 'web': web_origin, 'admin_password': ADMIN_PASSWORD, 'staff_password': STAFF_PASSWORD,
                      'payu_second_key': env['ZASTAL_PAYU_SECOND_KEY'], 'pid': os.getpid(), 'web_pid': web.pid}), flush=True)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        while not stop.is_set() and web.poll() is None:
            time.sleep(0.5)
    finally:
        try:
            os.killpg(web.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        server.shutdown()


if __name__ == '__main__':
    main()
