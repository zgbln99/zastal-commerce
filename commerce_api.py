"""Zastal Store commerce API.

Accounts, stock, fulfillment and gated live checkout use SQLite transactions.
DPD tracking is read from a local cache refreshed by a separate worker.
Keep behind an HTTPS reverse proxy.
"""
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import commerce_auth as auth
import commerce_personalization as personalization
import commerce_launch as launch
import commerce_cms as cms
import commerce_media as media
import commerce_ops as ops
import commerce_email as mail
import commerce_sales as sales
import commerce_payments as payments
import commerce_returns as returns
import commerce_pages as pages
import commerce_pricing as pricing
import commerce_dpd as dpd

ROOT = Path(__file__).resolve().parent
DATABASE = Path(os.environ.get("ZASTAL_DB", str(ROOT / "zastal.sqlite3")))
TOKEN = os.environ.get("ZASTAL_ADMIN_TOKEN", "")
VALID_STATUS = sales.STATUSES
# Transitions owned by dedicated workflows (fulfillment, payments, shipments, returns).
WORKFLOW_STATUS = ("spakowane", "wyslane_demo", "wydane", "wyslane", "oplacone", "zwrot")
PRINT_STATUS = ("oczekuje", "przygotowanie", "nanoszenie", "kontrola", "gotowe", "odrzucone")
LIMITS = defaultdict(deque)
RATE_LOCK = threading.Lock()

def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def connect():
    c = sqlite3.connect(DATABASE, timeout=20)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA busy_timeout=20000")
    return c

def ean13(identifier):
    """Prefix 200 = internal restricted circulation; not externally assigned GS1 GTIN."""
    stem = "200" + str(identifier).zfill(9)
    checksum = (10 - sum(int(c) * (3 if i % 2 else 1) for i,c in enumerate(stem)) % 10) % 10
    return stem + str(checksum)

def sizes_for(product):
    if product["category"] == "Dzieci": return ["116", "128", "140", "152", "164"]
    if product["category"] in ("Bluzy", "Koszulki"): return ["S","M","L","XL","XXL"]
    return ["UNI"]

def init():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, category TEXT, price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, items TEXT, total INTEGER, status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, created TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS transfers(id INTEGER PRIMARY KEY AUTOINCREMENT, supplier TEXT, design TEXT, purchased INTEGER, available INTEGER, created TEXT);
        CREATE TABLE IF NOT EXISTS product_variants (
           id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
           size TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, ean TEXT UNIQUE NOT NULL,
           stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
           UNIQUE(product_id,size), FOREIGN KEY(product_id) REFERENCES products(id));
        CREATE TABLE IF NOT EXISTS stock_events (
           id INTEGER PRIMARY KEY AUTOINCREMENT,variant_id INTEGER NOT NULL,
           delta INTEGER NOT NULL,reason TEXT NOT NULL,created TEXT NOT NULL,
           source TEXT DEFAULT 'admin',FOREIGN KEY(variant_id) REFERENCES product_variants(id));
        CREATE TABLE IF NOT EXISTS dtf_batches (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           design TEXT NOT NULL,supplier TEXT NOT NULL,reference TEXT,
           ordered INTEGER NOT NULL CHECK(ordered >= 0),
           received INTEGER NOT NULL DEFAULT 0 CHECK(received >= 0),
           available INTEGER NOT NULL DEFAULT 0 CHECK(available >= 0),
           cost_unit INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS production_tasks (
           id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,
           line_index INTEGER NOT NULL,batch_id INTEGER NOT NULL,
           design TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'oczekuje',
           created TEXT NOT NULL,updated TEXT NOT NULL,
           UNIQUE(order_id,line_index),FOREIGN KEY(batch_id) REFERENCES dtf_batches(id));
        CREATE TABLE IF NOT EXISTS audit_log(
           id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,
           object_id TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS order_receipts(
           order_id INTEGER PRIMARY KEY,tracking_token TEXT UNIQUE NOT NULL,
           fulfillment TEXT NOT NULL,shipping_fee INTEGER NOT NULL,subtotal INTEGER NOT NULL,
           idempotency_key TEXT UNIQUE,fingerprint TEXT NOT NULL,
           FOREIGN KEY(order_id) REFERENCES orders(id));
        """)
        auth.init_schema(c, TOKEN)
        personalization.init_schema(c)
        launch.init_schema(c)
        cms.init_schema(c)
        media.init_schema(c)
        ops.init_schema(c)
        sales.init_schema(c)
        dpd.init_schema(c)
        payments.init_schema(c)
        returns.init_schema(c)
        pages.init_schema(c)
        pricing.init_schema(c)
        if 'customer_id' not in {row['name'] for row in c.execute('PRAGMA table_info(order_receipts)')}:
            c.execute('ALTER TABLE order_receipts ADD COLUMN customer_id INTEGER REFERENCES users(id)')
        c.execute('CREATE INDEX IF NOT EXISTS receipts_customer ON order_receipts(customer_id)')
        products = c.execute("SELECT * FROM products ORDER BY id").fetchall()
        for product in products:
            count = c.execute("SELECT COUNT(*) FROM product_variants WHERE product_id=?", (product["id"],)).fetchone()[0]
            if count: continue
            sizes = sizes_for(product)
            quantity = max(0, product["stock"])
            base,rem = divmod(quantity,len(sizes))
            for index,size in enumerate(sizes):
                vsku = product["sku"]+"-"+size
                c.execute("INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(?,?,?,?,?)",
                  (product["id"],size,vsku,ean13(product["id"]*100+index+1),base+(1 if index<rem else 0)))
        if not c.execute("SELECT 1 FROM dtf_batches LIMIT 1").fetchone():
            c.executemany("INSERT INTO dtf_batches(design,supplier,reference,ordered,received,available,cost_unit,created) VALUES(?,?,?,?,?,?,?,?)",[
                ("Zastal Classic – przód","Dostawca demonstracyjny","DTF-DEMO-001",60,40,40,780,stamp()),
                ("Zastal 1946 – retro","Dostawca demonstracyjny","DTF-DEMO-002",30,25,25,950,stamp()),
                ("Zielona Góra – game day","Dostawca demonstracyjny","DTF-DEMO-003",50,20,20,850,stamp()),
            ])

def asdict(r): return dict(r) if r is not None else None

def audit(c,kind,obj,note):
    c.execute("INSERT INTO audit_log(kind,object_id,note,created) VALUES(?,?,?,?)",(kind,str(obj),note[:300],stamp()))

def compatible_products(c):
    products = [dict(x) for x in c.execute("SELECT * FROM products ORDER BY id")]
    for product in products:
        product.update(personalization.product_options(c, product['id']))
        product.update(media.public_gallery(c, product))
        product['price_reduction'] = pricing.reduction(c, product['id'])
        product['sizes'] = [v['size'] for v in c.execute('SELECT size FROM product_variants WHERE product_id=? ORDER BY id', (product['id'],))]
    return products

def catalog(c):
    products = compatible_products(c)
    variants = [dict(x) for x in c.execute("SELECT id,product_id,size,sku,ean,stock FROM product_variants ORDER BY id")]
    by_product=defaultdict(list)
    for v in variants:by_product[v["product_id"]].append(v)
    for p in products:p["variants"]=by_product[p["id"]]
    return products

class Invalid(Exception): pass

def readiness(c):
    return sales.readiness(c,mail.configuration()['configured'],payments.ready())

def order_detail(c,receipt):
    o=asdict(c.execute('SELECT * FROM orders WHERE id=?',(receipt['order_id'],)).fetchone())
    o['items']=json.loads(o['items'])
    o.update({key:receipt[key] for key in ('fulfillment','shipping_fee','subtotal')})
    o['events']=[dict(x) for x in c.execute('SELECT created,status FROM events WHERE order_id=? ORDER BY id',(o['id'],))]
    detail=sales.details(c,o['id'])
    o['details']=sales.public_details(detail)
    o['demo']=not detail or detail['mode']!='live'
    o['status_label']=sales.STATUS_LABELS.get(o['status'],o['status'])
    if detail and detail['payment_method']=='transfer' and detail['payment_status']!='paid':
        o['transfer']=sales.transfer_instructions(c,o['id'],o['total'])
    if detail and detail['payment_method']=='payu':
        o['payment']=payments.public_payment(c,o['id'])
    o['returns']=returns.public_for_order(c,o['id'])
    o['can_return']=bool(detail and detail['mode']=='live' and o['status'] in ('wydane','wyslane') and not any(r['status'] in ('zgloszony','przyjety') for r in o['returns']))
    return o

def checkout_reply(c,oid,total,token):
    reply={"id":oid,"total":total,"tracking_token":token}
    order=c.execute('SELECT status FROM orders WHERE id=?',(oid,)).fetchone()
    detail=sales.details(c,oid)
    reply['status']=order['status'] if order else 'nowe'
    reply['mode']=detail['mode'] if detail else 'test'
    if detail and detail['payment_method']=='payu':
        reply['payment']={'method':'payu',**payments.public_payment(c,oid)}
    elif detail:
        reply['payment']={'method':detail['payment_method'],'status':detail['payment_status']}
    if detail and detail['payment_method']=='transfer':
        reply['transfer']=sales.transfer_instructions(c,oid,total)
    return reply

def account_orders(c,uid):
    return [order_detail(c,r) for r in c.execute('SELECT * FROM order_receipts WHERE customer_id=? ORDER BY order_id DESC',(uid,))]

def customers(c):
    return [dict(r) for r in c.execute("""SELECT u.id,u.identifier,u.name,u.active,u.created,
       COUNT(o.id) AS order_count,COALESCE(SUM(CASE WHEN o.status!='anulowane' THEN o.total ELSE 0 END),0) AS order_total
       FROM users u LEFT JOIN order_receipts r ON r.customer_id=u.id LEFT JOIN orders o ON o.id=r.order_id
       WHERE u.role='customer' GROUP BY u.id ORDER BY u.id DESC""")]

class Handler(BaseHTTPRequestHandler):
    server_version="ZastalDemo/0.5"
    def log_message(self,fmt,*args):
        # Public logs exclude supplied auth credentials and request bodies.
        pass

    def respond(self,status,value,content_type="application/json"):
        if not isinstance(value,(bytes,str)):
            value=json.dumps(value,ensure_ascii=False)
        if isinstance(value,str):value=value.encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type",content_type+"; charset=utf-8")
        self.send_header("Content-Length",str(len(value)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options","DENY")
        for key, header in getattr(self, 'response_headers', []):self.send_header(key, header)
        self.end_headers()
        self.wfile.write(value)

    def raw_body(self,limit=35000):
        length=int(self.headers.get("Content-Length","0"))
        if length<1 or length>limit:raise Invalid("Nieprawidłowy rozmiar żądania")
        return self.rfile.read(length)

    def client_ip(self):
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def body(self):
        try:
            data=json.loads(self.raw_body(1_900_000 if self.path=="/api/admin/home/media" else 35000))
            if not isinstance(data,dict):raise Invalid("Oczekiwano obiektu")
            return data
        except (ValueError,UnicodeError):raise Invalid("Nieprawidłowy JSON")

    def access(self,path):
        self.response_headers=[]
        try:
            with connect() as c:auth.session(self,c)
            if path.startswith('/api/admin/'):auth.require_staff(self,auth.capability_for(self.command,path))
            elif path.startswith('/api/account/'):auth.require_user(self)
            if self.command in ('POST','PATCH'):
                auth.check_origin(self)
                if path.startswith(('/api/admin/','/api/account/')):auth.require_csrf(self)
            return True
        except auth.AuthError as ex:
            self.respond(ex.status,{'error':str(ex),'code':ex.code})
            return False

    def error(self,ex):
        self.respond(400,{"error":str(ex)})

    def do_GET(self):
        path=urlparse(self.path).path
        if path=="/health":
            try:
                with connect() as c:phase=readiness(c)['mode']
            except sqlite3.Error:return self.respond(503,{"ok":False,"error":"database"})
            return self.respond(200,{"ok":True,"version":"0.11","sales_phase":phase,"accounts":True,"cms":True,"pos":True,"email":True,"payments":payments.configuration()['configured']})
        if path.startswith("/api/store/media/"):
            data=cms.load_media(path.rsplit("/",1)[-1]);return self.respond(200,data,"image/webp") if data is not None else self.respond(404,{"error":"Nie znaleziono zdjęcia"})
        if not self.access(path):return
        try:
            with connect() as c:
                if auth.dispatch(self,path,c):return
                if auth.staff_dispatch(self,path,c):return
                if mail.dispatch(self,path,c):return
                if path=='/api/admin/fulfillment':return self.respond(200,ops.queue(c))
                operation_route=re.fullmatch(r'/api/admin/fulfillment/([1-9][0-9]*)',path)
                if operation_route:return self.respond(200,ops.detail(c,int(operation_route.group(1))))
                if path=='/api/store/status':
                    state=readiness(c)
                    return self.respond(200,{**launch.snapshot(c,public=True,readiness=state),'config':{**sales.public_config(c,mail.configuration()['configured'],payments.ready(),state['mode']),'pages':pages.listing(c)}})
                if path=='/api/store/pages':return self.respond(200,pages.listing(c))
                page_route=re.fullmatch(r'/api/store/pages/([a-z0-9-]{1,60})',path)
                if page_route:return self.respond(200,pages.public_page(c,page_route.group(1)))
                if path=='/api/admin/pages':return self.respond(200,pages.listing(c,admin=True))
                admin_page_route=re.fullmatch(r'/api/admin/pages/([a-z0-9-]{1,60})',path)
                if admin_page_route:return self.respond(200,pages.admin_page(c,admin_page_route.group(1)))
                if path=='/api/admin/settings':
                    state=readiness(c)
                    config=payments.configuration()
                    return self.respond(200,{'settings':sales.settings(c),'shipping_methods':sales.shipping_methods(c),'readiness':state,
                        'payu':{'configured':config['configured'],'environment':config['environment'],'pos_id':config['pos_id'],'missing':config['missing']},
                        'email':mail.configuration()['configured']})
                if path=='/api/admin/shipping':return self.respond(200,sales.shipping_methods(c))
                if path=='/api/admin/shifts':
                    return self.respond(200,{**ops.shifts(c),'mode':readiness(c)['mode'],'can_discount':'discounts' in auth.capabilities(self.request_user)})
                shift_route=re.fullmatch(r'/api/admin/shifts/([1-9][0-9]*)',path)
                if shift_route:
                    row=c.execute('SELECT * FROM pos_shifts WHERE id=?',(int(shift_route.group(1)),)).fetchone()
                    if not row:return self.respond(404,{'error':'Nie znaleziono zmiany'})
                    return self.respond(200,{**ops.shift_summary(c,row),'sales':ops.shift_sales(c,row['id'])})
                if path=='/api/store/home':return self.respond(200,cms.get(c))
                if path=='/api/admin/home':return self.respond(200,cms.get(c,admin=True))
                if path=='/api/admin/home/revisions':return self.respond(200,cms.history(c))
                if path=='/api/admin/home/media':return self.respond(200,cms.list_media())
                if path=='/api/admin/launch':return self.respond(200,launch.snapshot(c,readiness=readiness(c)))
                if path=='/api/account/orders':
                    auth.require_user(self,'customer')
                    return self.respond(200,account_orders(c,self.request_user['id']))
                if path.startswith('/api/account/orders/'):
                    auth.require_user(self,'customer')
                    oid=int(path.rsplit('/',1)[1])
                    receipt=c.execute('SELECT * FROM order_receipts WHERE order_id=? AND customer_id=?',(oid,self.request_user['id'])).fetchone()
                    return self.respond(200,order_detail(c,receipt)) if receipt else self.respond(404,{'error':'Nie znaleziono zamówienia'})
                if path=='/api/admin/products':return self.respond(200,catalog(c))
                price_route=re.fullmatch(r'/api/admin/products/([1-9][0-9]*)/prices',path)
                if price_route:return self.respond(200,{'history':pricing.history(c,int(price_route.group(1))),'reduction':pricing.reduction(c,int(price_route.group(1)))})
                gallery_route=re.fullmatch(r'/api/admin/products/([1-9][0-9]*)/gallery',path)
                if gallery_route:
                    try:return self.respond(200,media.get(c,int(gallery_route.group(1))))
                    except LookupError as ex:return self.respond(404,{'error':str(ex)})
                if path in ('/api/players', '/api/admin/players'):return self.respond(200,personalization.roster(c, path.startswith('/api/admin/')))
                if path=='/api/admin/customers':return self.respond(200,customers(c))
                if path.startswith('/api/admin/customers/'):
                    uid=int(path.rsplit('/',1)[1]);customer=next((x for x in customers(c) if x['id']==uid),None)
                    if not customer:return self.respond(404,{'error':'Nie znaleziono klienta'})
                    return self.respond(200,{**customer,'orders':account_orders(c,uid)})
                if path=="/api/products":return self.respond(200,compatible_products(c))
                if path=="/api/catalog":return self.respond(200,catalog(c))
                if path.startswith("/api/catalog/"):
                    pid=int(path.rsplit("/",1)[1])
                    p=next((x for x in catalog(c) if x["id"]==pid),None)
                    return self.respond(200,p) if p else self.respond(404,{"error":"Produkt nie istnieje"})
                if path.startswith("/api/orders/"):
                    try:oid=int(path.rsplit("/",1)[1])
                    except ValueError:return self.respond(404,{"error":"Nie znaleziono zamówienia"})
                    token=parse_qs(urlparse(self.path).query).get("token",[""])[0]
                    receipt=c.execute("SELECT * FROM order_receipts WHERE order_id=?",(oid,)).fetchone()
                    if not receipt or not secrets.compare_digest(receipt["tracking_token"],token):
                        return self.respond(404,{"error":"Nie znaleziono zamówienia"})
                    return self.respond(200,order_detail(c,receipt))
                if path=="/api/admin/orders":
                    return self.respond(200,[dict(x) for x in c.execute("""SELECT o.*,d.mode,d.payment_status,d.payment_method,d.customer_email,d.customer_name,d.shipping_code,d.shipping_name,d.tracking_number
                        FROM orders o LEFT JOIN order_details d ON d.order_id=o.id ORDER BY o.id DESC LIMIT 300""")])
                if path.startswith("/api/admin/orders/"):
                    oid=int(path.rsplit("/",1)[1]);o=asdict(c.execute("SELECT * FROM orders WHERE id=?",(oid,)).fetchone())
                    if not o:return self.respond(404,{"error":"Nie znaleziono zamówienia"})
                    o["items"]=json.loads(o["items"])
                    o["events"]=[dict(x) for x in c.execute("SELECT * FROM events WHERE order_id=? ORDER BY id DESC",(oid,))]
                    o["production"]=[dict(x) for x in c.execute("SELECT * FROM production_tasks WHERE order_id=? ORDER BY id",(oid,))]
                    receipt=c.execute("SELECT fulfillment,shipping_fee,subtotal FROM order_receipts WHERE order_id=?",(oid,)).fetchone()
                    if receipt:o.update(dict(receipt))
                    customer=c.execute('SELECT u.id,u.identifier,u.name FROM users u JOIN order_receipts r ON r.customer_id=u.id WHERE r.order_id=?',(oid,)).fetchone()
                    if customer:o['customer']=dict(customer)
                    detail=sales.details(c,oid)
                    o['details']=detail
                    o['demo']=not detail or detail['mode']!='live'
                    o['payments']=payments.order_payments(c,oid)
                    o['returns']=returns.for_order(c,oid)
                    o['printed_lines']=[dict(x) for x in c.execute('SELECT line_index,printed_qty FROM fulfillment_lines WHERE order_id=? AND printed_qty>0',(oid,))]
                    if detail and detail['payment_method']=='transfer':o['transfer']=sales.transfer_instructions(c,oid,o['total'])
                    return self.respond(200,o)
                if path=='/api/admin/returns':
                    return self.respond(200,{'returns':returns.listing(c,open_only=parse_qs(urlparse(self.path).query).get('all',['0'])[0]!='1'),'reasons':returns.REASONS})
                if path=="/api/admin/inventory":
                    q="""SELECT v.id,v.product_id,v.size,v.sku,v.ean,v.stock,
                     p.name,p.category,p.price FROM product_variants v
                     JOIN products p ON p.id=v.product_id ORDER BY p.id,v.id"""
                    return self.respond(200,[dict(x) for x in c.execute(q)])
                if path=="/api/admin/stock-events":
                    return self.respond(200,[dict(x) for x in c.execute("SELECT e.*,v.sku FROM stock_events e JOIN product_variants v ON v.id=e.variant_id ORDER BY e.id DESC LIMIT 100")])
                if path=="/api/admin/transfers":
                    return self.respond(200,[dict(x) for x in c.execute("SELECT * FROM dtf_batches ORDER BY id DESC")])
                if path=="/api/admin/production":
                    q="""SELECT t.*,b.supplier,b.reference,o.status AS order_status,o.items AS order_items
                       FROM production_tasks t JOIN dtf_batches b ON b.id=t.batch_id
                       JOIN orders o ON o.id=t.order_id ORDER BY t.id DESC"""
                    tasks=[]
                    for row in c.execute(q):
                        task=dict(row)
                        line=json.loads(task.pop('order_items'))[task['line_index']]
                        task.update(product_name=line.get('name','Produkt'),size=line.get('size') or 'UNI',qty=line.get('qty',1))
                        if line.get('personalization') is not None:task['personalization']=line['personalization']
                        for key_ in ('decoration_method','print_layout','preorder'):
                            if line.get(key_) is not None:task[key_]=line[key_]
                        tasks.append(task)
                    return self.respond(200,tasks)
                if path=="/api/admin/activity":
                    return self.respond(200,[dict(x) for x in c.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 80")])
            return self.respond(404,{"error":"Nie znaleziono"})
        except (auth.AuthError,ops.OpsError,sales.SalesError,payments.PaymentError,returns.ReturnError,pages.PageError) as ex:return self.respond(ex.status,{'error':str(ex),'code':ex.code})
        except (ValueError,TypeError):return self.respond(400,{"error":"Nieprawidłowy identyfikator"})
        except sqlite3.Error:return self.respond(500,{"error":"Błąd bazy danych"})

    def public_rate(self):
        ip=self.headers.get("X-Real-IP") or self.client_address[0]
        now=time.monotonic()
        with RATE_LOCK:
            q=LIMITS[ip]
            while q and q[0]<now-600:q.popleft()
            if len(q)>=20:return False
            q.append(now);return True

    def do_POST(self):
        path=urlparse(self.path).path
        if path=='/api/payments/payu/notify':
            # Server-to-server webhook: authenticated by the provider signature, never by cookies.
            try:raw=self.raw_body(200000)
            except Invalid as ex:return self.error(ex)
            try:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    status,result=payments.handle_notification(c,raw,self.headers.get('OpenPayu-Signature',''))
                    if status==200 and result in ('completed',):mail.enqueue_order(c,int(c.execute('SELECT order_id FROM payments WHERE ext_order_id=?',(json.loads(raw)['order']['extOrderId'],)).fetchone()[0]),'order_paid')
            except sqlite3.Error:return self.respond(500,{"error":"Błąd zapisu danych"})
            return self.respond(status,{'ok':status==200,'result':result})
        if not self.access(path):return
        try:
            if path == '/api/orders':
                with connect() as c:live=readiness(c)['mode']=='live'
                if not live and not launch.isolated_test_workflow(DATABASE):
                    return self.respond(503,{'error':'Sprzedaż online zostanie uruchomiona po skonfigurowaniu usług sklepu. Konto klienta możesz już założyć.','code':'store_prelaunch'})
            if path=='/api/orders/lookup':
                data=self.body()
                number=data.get('order');email=data.get('email')
                if isinstance(number,str):number=number.strip().upper().removeprefix('ZS-').lstrip('0') or '0'
                try:oid=int(number)
                except (TypeError,ValueError):raise Invalid('Podaj numer zamówienia (np. ZS-00012)')
                email=auth.identifier_value(email,email=True)
                if not self.public_rate():return self.respond(429,{"error":"Zbyt wiele prób. Spróbuj później."})
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    detail=sales.details(c,oid)
                    owner=c.execute('SELECT u.identifier FROM order_receipts r JOIN users u ON u.id=r.customer_id WHERE r.order_id=?',(oid,)).fetchone()
                    known={(detail['customer_email'] if detail else ''),(owner['identifier'] if owner else '')}-{''}
                    if email in known:
                        mail.enqueue_order(c,oid,'order_created',resend=True)
                        audit(c,'order',oid,'Ponownie wysłano link do zamówienia na adres klienta')
                return self.respond(200,{'ok':True,'message':'Jeśli zamówienie istnieje i adres się zgadza, wyślemy link do jego podglądu e-mailem.'})
            return_route=re.fullmatch(r'/api/orders/([1-9][0-9]*)/returns',path)
            if return_route:
                data=self.body();token=data.get('tracking_token')
                if not isinstance(token,str) or len(token)>128:raise Invalid('Nieprawidłowe zamówienie')
                if not self.public_rate():return self.respond(429,{"error":"Zbyt wiele prób. Spróbuj później."})
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    oid=int(return_route.group(1))
                    receipt=c.execute('SELECT * FROM order_receipts WHERE order_id=?',(oid,)).fetchone()
                    if not receipt or not secrets.compare_digest(receipt['tracking_token'],token):return self.respond(404,{'error':'Nie znaleziono zamówienia'})
                    created=returns.register(c,oid,data,'customer')
                    mail.enqueue_order(c,oid,'return_update',f"{created['id']}:{created['status']}")
                return self.respond(201,{'ok':True,'return':{key_:created[key_] for key_ in ('id','kind','status','reason_label','created')}})
            retry_route=re.fullmatch(r'/api/orders/([1-9][0-9]*)/payment/retry',path)
            if retry_route:
                data=self.body();token=data.get('tracking_token')
                if not isinstance(token,str) or len(token)>128:raise Invalid('Nieprawidłowe zamówienie')
                if not self.public_rate():return self.respond(429,{"error":"Zbyt wiele prób. Spróbuj później."})
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    oid=int(retry_route.group(1))
                    receipt=c.execute('SELECT * FROM order_receipts WHERE order_id=?',(oid,)).fetchone()
                    if not receipt or not secrets.compare_digest(receipt['tracking_token'],token):return self.respond(404,{'error':'Nie znaleziono zamówienia'})
                    order=c.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone();detail=sales.details(c,oid)
                    if readiness(c)['mode']!='live' or not detail or detail['mode']!='live' or detail['payment_method']!='payu':return self.respond(409,{'error':'To zamówienie nie korzysta z płatności online','code':'payment_not_applicable'})
                    if order['status']!='oczekuje_platnosci' or detail['payment_status']=='paid':return self.respond(409,{'error':'Zamówienie nie oczekuje już na płatność','code':'payment_not_pending'})
                    row=payments.create_order(c,order,{**detail,'tracking_token':receipt['tracking_token'],'shipping_fee':receipt['shipping_fee']},self.client_ip(),json.loads(order['items']))
                return self.respond(200,{'redirect_url':row['redirect_url'],'ext_order_id':row['ext_order_id']})
            with connect() as c:
                if auth.dispatch(self,path,c):return
                if auth.staff_dispatch(self,path,c):return
                if mail.dispatch(self,path,c):return
            data=self.body()
            if path=='/api/admin/pos/sales':
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    result=ops.create_sale(c,data,self.request_user['id'],live=readiness(c)['mode']=='live',can_discount='discounts' in auth.capabilities(self.request_user))
                    if not result['replayed']:mail.enqueue_order(c,result['id'])
                return self.respond(200 if result['replayed'] else 201,result)
            completion_route=re.fullmatch(r'/api/admin/fulfillment/([1-9][0-9]*)/complete',path)
            if completion_route:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    result=ops.complete(c,int(completion_route.group(1)),data,self.request_user['id'])
                    mail.enqueue_order(c,result['id'],'order_status_changed')
                return self.respond(200,result)
            if path=='/api/admin/home/media':
                try:return self.respond(201,{'url':cms.write_media(data)})
                except ValueError as ex:return self.error(ex)
            if path=='/api/admin/home/publish':
                try:
                    with connect() as c:
                        c.execute('BEGIN IMMEDIATE')
                        cms.publish(c,data.get('revision'))
                        audit(c,'homepage','published','Opublikowano stronę główną')
                        result=cms.get(c,admin=True)
                    return self.respond(200,result)
                except RuntimeError as ex:return self.respond(409,{'error':str(ex)})
            if path=='/api/admin/home/restore':
                try:
                    with connect() as c:
                        c.execute('BEGIN IMMEDIATE')
                        cms.restore(c,data.get('revision_id'),data.get('revision'))
                        audit(c,'homepage','restore','Przywrócono szkic poprzedniej wersji')
                        result=cms.get(c,admin=True)
                    return self.respond(200,result)
                except RuntimeError as ex:return self.respond(409,{'error':str(ex)})
            if path=='/api/admin/inventory/import':
                rows=data.get('rows')
                reason=data.get('reason')
                if not isinstance(rows,list) or not 1<=len(rows)<=100:
                    raise Invalid('Plik musi zawierać od 1 do 100 wariantów')
                if not isinstance(reason,str) or not 3<=len(reason.strip())<=160:
                    raise Invalid('Podaj uzasadnienie aktualizacji magazynu')
                seen=set()
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    changes=[]
                    affected=set()
                    for row in rows:
                        if not isinstance(row,dict) or set(row)!={'sku','stock'}:
                            raise Invalid('Nieprawidłowa struktura wiersza CSV')
                        sku=row['sku'];stock=row['stock']
                        if not isinstance(sku,str) or not 1<=len(sku)<=90 or sku in seen:
                            raise Invalid('Pusty lub powtórzony numer SKU')
                        if type(stock) is not int or not 0<=stock<=100000:
                            raise Invalid('Stan musi być liczbą całkowitą od 0 do 100 000')
                        seen.add(sku)
                        variant=c.execute('SELECT * FROM product_variants WHERE sku=?',(sku,)).fetchone()
                        if variant is None:raise Invalid('Nieznany wariant: '+sku[:90])
                        delta=stock-variant['stock']
                        if delta:
                            c.execute('UPDATE product_variants SET stock=? WHERE id=?',(stock,variant['id']))
                            c.execute('INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)',
                                      (variant['id'],delta,reason.strip(),stamp(),'inventory-import'))
                            changes.append({'sku':sku,'old':variant['stock'],'new':stock,'delta':delta})
                            affected.add(variant['product_id'])
                    for product_id in affected:
                        c.execute('UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=?) WHERE id=?',
                                  (product_id,product_id))
                    audit(c,'stock-import','bulk',f"Zaktualizowano {len(changes)} wariantów, import: {reason.strip()[:120]}")
                return self.respond(200,{'ok':True,'rows':len(rows),'changed':len(changes),'changes':changes})
            account_return=re.fullmatch(r'/api/account/orders/([1-9][0-9]*)/returns',path)
            if account_return:
                user=auth.require_user(self,'customer')
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    oid=int(account_return.group(1))
                    if not c.execute('SELECT 1 FROM order_receipts WHERE order_id=? AND customer_id=?',(oid,user['id'])).fetchone():return self.respond(404,{'error':'Nie znaleziono zamówienia'})
                    created=returns.register(c,oid,data,'customer')
                    mail.enqueue_order(c,oid,'return_update',f"{created['id']}:{created['status']}")
                return self.respond(201,{'ok':True,'return':{key_:created[key_] for key_ in ('id','kind','status','reason_label','created')}})
            if path=='/api/account/orders/claim':
                user=auth.require_user(self,'customer')
                oid=data.get('id');token=data.get('tracking_token')
                if isinstance(oid,bool) or not isinstance(oid,int) or not isinstance(token,str) or len(token)>128:raise Invalid('Nieprawidłowe zamówienie')
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    receipt=c.execute('SELECT * FROM order_receipts WHERE order_id=?',(oid,)).fetchone()
                    if not receipt or not secrets.compare_digest(receipt['tracking_token'],token) or receipt['customer_id'] not in (None,user['id']):
                        return self.respond(404,{'error':'Nie znaleziono zamówienia do przypisania'})
                    c.execute('UPDATE order_receipts SET customer_id=? WHERE order_id=?',(user['id'],oid))
                    c.commit()
                    return self.respond(200,{'ok':True})
            if path=="/api/orders":
                user=getattr(self,'request_user',None)
                owner=user['id'] if user and user['role']=='customer' else None
                if 'account_id' in data:
                    requested=data['account_id']
                    if requested is None:owner=None
                    elif isinstance(requested,bool) or not isinstance(requested,int) or requested<1:raise Invalid('Nieprawidłowe konto zamówienia')
                    elif not user:raise auth.AuthError(401,'Zaloguj się na konto użyte do tego zamówienia.','checkout_account_required')
                    elif requested!=owner:raise auth.AuthError(409,'To zamówienie rozpoczęto na innym koncie.','checkout_account_required')
                if owner:auth.require_csrf(self)
                if not self.public_rate():return self.respond(429,{"error":"Zbyt wiele zamówień. Spróbuj później."})
                lines=data.get("items")
                if not isinstance(lines,list) or not 1<=len(lines)<=20:raise Invalid("Pusty lub nieprawidłowy koszyk")
                key=data.get("idempotency_key")
                if key is not None and (not isinstance(key,str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}",key)):raise Invalid("Nieprawidłowy identyfikator zamówienia")
                normalized=[]
                for line in lines:
                    if not isinstance(line,dict):raise Invalid("Nieprawidłowy produkt")
                    pid=line.get("id",0);qty=line.get("quantity",0)
                    if isinstance(pid,bool) or not isinstance(pid,int) or isinstance(qty,bool) or not isinstance(qty,int):raise Invalid("Nieprawidłowy produkt lub ilość")
                    size=str(line.get("size") or "UNI").strip().upper()
                    if qty<1 or qty>20 or len(size)>10:raise Invalid("Nieprawidłowy rozmiar lub ilość")
                    item = {"id":pid,"quantity":qty,"size":size}
                    if 'personalization' in line:
                        item['personalization'] = personalization.normalize_request(line['personalization'])
                    normalized.append(item)
                extended=any(key_ in data for key_ in ('customer','shipping','payment','invoice','consents'))
                result=[]
                with connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    state=readiness(c);live=state['mode']=='live';mode='live' if live else 'test'
                    config=sales.settings(c)
                    checkout=sales.validate_checkout(data,sales.shipping_methods(c,enabled_only=live),sales.payment_options(c,config,payments.ready()),config,live)
                    method=checkout['method']
                    identity={"items":normalized,"fulfillment":method['code']}
                    if extended:identity['checkout']={key_:checkout[key_] for key_ in ('customer','address','locker_code','payment','invoice','consents')}
                    # Retain v0.4 fingerprints for old guest attempts; identity is checked separately.
                    fingerprint=hashlib.sha256(json.dumps(identity,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
                    if key:
                        previous=c.execute("SELECT r.*,o.total FROM order_receipts r JOIN orders o ON o.id=r.order_id WHERE idempotency_key=?",(key,)).fetchone()
                        if previous:
                            if previous['customer_id']!=owner:return self.respond(409,{'error':'Zaloguj się na konto użyte do tego zamówienia.','code':'checkout_account_required'})
                            if previous["fingerprint"]!=fingerprint:return self.respond(409,{"error":"Ten identyfikator jest już przypisany do innego koszyka. Odśwież zamówienie."})
                            return self.respond(200,checkout_reply(c,previous["order_id"],previous["total"],previous["tracking_token"]))
                    total=0
                    for line in normalized:
                        pid=line["id"];qty=line["quantity"];size=line["size"]
                        p=c.execute("SELECT * FROM products WHERE id=?",(pid,)).fetchone()
                        v=c.execute("SELECT * FROM product_variants WHERE product_id=? AND size=?",(pid,size)).fetchone()
                        if not p or not v:raise Invalid("Wybierz poprawny wariant produktu")
                        if v["stock"]<qty:raise Invalid("Niewystarczająca dostępność wariantu "+size)
                        c.execute("UPDATE product_variants SET stock=stock-? WHERE id=?",(qty,v["id"]))
                        c.execute("UPDATE products SET stock=stock-? WHERE id=?",(qty,pid))
                        c.execute("INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)",(v["id"],-qty,"zamówienie" if live else "zamówienie testowe",stamp(),"checkout"))
                        printed,fee=personalization.snapshot(c,pid,line.get('personalization'))
                        unit_price=p['price']+fee
                        total+=unit_price*qty
                        item={"sku":p["sku"],"variant_sku":v["sku"],"ean":v["ean"],"name":p["name"],"size":size,"qty":qty,
                              "base_unit_price":p['price'],"personalization_fee":fee,"unit_price":unit_price}
                        if printed is not None:item['personalization']=printed
                        extras=personalization.line_extras(c,pid)
                        if printed is not None:item.update({key_:extras[key_] for key_ in ('decoration_method','print_layout') if key_ in extras})
                        if 'preorder' in extras:item['preorder']=extras['preorder']
                        result.append(item)
                    now=stamp()
                    subtotal=total
                    shipping=sales.shipping_cost(method,subtotal)
                    total+=shipping
                    status=sales.initial_status(checkout['payment'],mode)
                    cur=c.execute("INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)",(now,json.dumps(result,ensure_ascii=False),total,status))
                    oid=cur.lastrowid
                    tracking=secrets.token_urlsafe(32)
                    c.execute("INSERT INTO order_receipts(order_id,tracking_token,fulfillment,shipping_fee,subtotal,idempotency_key,fingerprint,customer_id) VALUES(?,?,?,?,?,?,?,?)",(oid,tracking,method['code'],shipping,subtotal,key,fingerprint,owner))
                    c.execute("INSERT INTO events(order_id,created,status) VALUES(?,?,?)",(oid,now,status))
                    sales.save_details(c,oid,checkout,mode)
                    audit(c,"order",oid,"Utworzono zamówienie" if live else "Utworzono zamówienie demonstracyjne")
                    if live and checkout['payment']=='payu':
                        order_row=c.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone()
                        try:payments.create_order(c,order_row,{**sales.details(c,oid),'tracking_token':tracking,'shipping_fee':shipping},self.client_ip(),result)
                        except payments.PaymentError as ex:
                            sales.mark_payment(c,oid,'failed','PayU: '+ex.code)
                            audit(c,'payment',oid,'Nie udało się rozpocząć płatności online: '+ex.code)
                    mail.enqueue_order(c,oid)
                    reply=checkout_reply(c,oid,total,tracking)
                return self.respond(201,reply)
            if path in ('/api/admin/shifts/open','/api/admin/shifts/close'):
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    helper=ops.start_shift if path.endswith('/open') else ops.close_shift
                    result=helper(c,data,self.request_user['id'])
                return self.respond(201 if path.endswith('/open') else 200,result)
            if path=='/api/admin/shipping':
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    method=sales.save_shipping(c,data)
                    audit(c,'settings','shipping',f"Dodano metodę dostawy {method['code']}")
                return self.respond(201,method)
            payment_route=re.fullmatch(r'/api/admin/orders/([1-9][0-9]*)/payment',path)
            if payment_route:
                oid=int(payment_route.group(1));action=data.get('action');note=str(data.get('note','')).strip()[:200]
                actor=self.request_user['id']
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    order=c.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone();detail=sales.details(c,oid)
                    if not order or not detail:return self.respond(404,{'error':'Nie znaleziono zamówienia'})
                    if action=='confirm':
                        if detail['payment_method']=='payu':raise Invalid('Płatności PayU potwierdza operator; użyj ręcznego potwierdzenia tylko dla przelewu lub odbioru')
                        changed=sales.mark_paid(c,oid,order['total'],'Ręcznie',f'administrator {actor}: {note}')
                        audit(c,'payment',oid,f'Administrator {actor}: potwierdzono wpłatę ({detail["payment_method"]}) {note}')
                        if changed:mail.enqueue_order(c,oid,'order_paid')
                    elif action=='refund':
                        amount=data.get('amount',order['total'])
                        if detail['payment_method']=='payu':
                            refund=payments.request_refund(c,oid,amount,note,actor)
                        else:
                            if isinstance(amount,bool) or not isinstance(amount,int) or not 1<=amount<=order['total']:raise Invalid('Nieprawidłowa kwota zwrotu')
                            sales.mark_payment(c,oid,'refunded' if amount>=order['total'] else 'partially_refunded',f'Zwrot ręczny {amount/100:.2f} PLN: {note}')
                            audit(c,'payment',oid,f'Administrator {actor}: zarejestrowano zwrot {amount/100:.2f} PLN ({detail["payment_method"]}) {note}')
                    elif action=='note':
                        sales.mark_payment(c,oid,detail['payment_status'],note)
                        audit(c,'payment',oid,f'Administrator {actor}: notatka płatności: {note}')
                    else:raise Invalid('Wybierz działanie: confirm, refund lub note')
                    reply={'ok':True,'details':sales.details(c,oid),'payments':payments.order_payments(c,oid),'status':c.execute('SELECT status FROM orders WHERE id=?',(oid,)).fetchone()['status']}
                return self.respond(200,reply)
            shipment_route=re.fullmatch(r'/api/admin/orders/([1-9][0-9]*)/shipment',path)
            if shipment_route:
                oid=int(shipment_route.group(1))
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    detail=sales.record_shipment(c,oid,data)
                    audit(c,'order',oid,f"Administrator {self.request_user['id']}: nadano przesyłkę {detail['carrier']} {detail['tracking_number']}")
                    mail.enqueue_order(c,oid,'order_status_changed')
                return self.respond(200,{'ok':True,'details':detail,'status':'wyslane'})
            page_action=re.fullmatch(r'/api/admin/pages/([a-z0-9-]{1,60})/(publish|unpublish)',path)
            if page_action:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    slug,action=page_action.groups()
                    result=pages.publish(c,slug,data) if action=='publish' else pages.unpublish(c,slug)
                    audit(c,'pages',slug,f"Administrator {self.request_user['id']}: {'opublikowano' if action=='publish' else 'wycofano'} stronę {slug}")
                return self.respond(200,result)
            if path=='/api/admin/returns':
                oid=data.get('order_id')
                if isinstance(oid,bool) or not isinstance(oid,int) or oid<1:raise Invalid('Podaj numer zamówienia')
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    created=returns.register(c,oid,data,'staff',self.request_user['id'])
                    mail.enqueue_order(c,oid,'return_update',f"{created['id']}:{created['status']}")
                return self.respond(201,created)
            cancel_route=re.fullmatch(r'/api/admin/orders/([1-9][0-9]*)/cancel',path)
            if cancel_route:
                auth.require_staff(self,'returns')
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    oid=int(cancel_route.group(1))
                    result=returns.cancel_after_personalization(c,oid,self.request_user['id'],data.get('reason'))
                    mail.enqueue_order(c,oid,'order_status_changed')
                return self.respond(200,result)
            if path=='/api/admin/orders/expire-unpaid':
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    cancelled=sales.expire_unpaid(c)
                    for oid in cancelled:mail.enqueue_order(c,oid,'order_status_changed')
                return self.respond(200,{'ok':True,'cancelled':cancelled})
            if path=='/api/admin/products':
                product=personalization.validate_product(data)
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    cur=c.execute('INSERT INTO products(name,sku,category,price,stock) VALUES(?,?,?,?,?)',
                                  tuple(product[key] for key in ('name','sku','category','price','stock')))
                    pid=cur.lastrowid
                    personalization.save_options(c,pid,product)
                    pricing.record(c,pid,product['price'],self.request_user['id'])
                    sizes=sizes_for(product)
                    base,rem=divmod(product['stock'],len(sizes))
                    for index,size in enumerate(sizes):
                        c.execute('INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(?,?,?,?,?)',
                                  (pid,size,product['sku']+'-'+size,ean13(pid*100+index+1),base+(1 if index<rem else 0)))
                    audit(c,'product',pid,'Utworzono produkt i warianty')
                    result=next(p for p in catalog(c) if p['id']==pid)
                    c.commit()
                    return self.respond(201,result)
            if path=='/api/admin/players':
                player=personalization.player_value(data)
                with connect() as c:
                    cur=c.execute('INSERT INTO players(name,print_name,number,active) VALUES(?,?,?,?)',
                                  tuple(player[key] for key in ('name','print_name','number','active')))
                    audit(c,'player',cur.lastrowid,'Dodano zawodnika do listy nadruków')
                    result=personalization.player_public(c.execute('SELECT * FROM players WHERE id=?',(cur.lastrowid,)).fetchone(),True)
                    c.commit()
                    return self.respond(201,result)
            if path=="/api/admin/transfers":
                design=str(data.get("design","")).strip()
                supplier=str(data.get("supplier","")).strip()
                reference=str(data.get("reference","")).strip()
                quantity=int(data.get("quantity",0));cost=int(data.get("cost_unit",0))
                if not design or not supplier or len(design)>100 or len(supplier)>100 or len(reference)>80 or not 0<quantity<=100000 or cost<0:raise Invalid("Uzupełnij dane i poprawną ilość")
                with connect() as c:
                    cur=c.execute("INSERT INTO dtf_batches(design,supplier,reference,ordered,received,available,cost_unit,created) VALUES(?,?,?,?,?,?,?,?)",(design,supplier,reference,quantity,0,0,cost,stamp()))
                    audit(c,"transfer",cur.lastrowid,f"Zamówiono {quantity} gotowych transferów od {supplier}")
                    return self.respond(201,{"id":cur.lastrowid})
            if path=="/api/admin/production":
                oid=int(data.get("order_id",0));idx=int(data.get("line_index",-1));bid=int(data.get("batch_id",0))
                with connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    o=c.execute("SELECT * FROM orders WHERE id=?",(oid,)).fetchone()
                    b=c.execute("SELECT * FROM dtf_batches WHERE id=?",(bid,)).fetchone()
                    if not o or o["status"] in ("anulowane","wyslane_demo","wydane","spakowane"):raise Invalid("Brak aktywnego zamówienia")
                    lines=json.loads(o["items"])
                    if idx<0 or idx>=len(lines) or not b:raise Invalid("Nieprawidłowa pozycja lub nadruk")
                    count=int(lines[idx].get("qty",1))
                    if count<1 or b["available"]<count:raise Invalid("Brak dostępnych nadruków z tej partii")
                    if c.execute("SELECT 1 FROM production_tasks WHERE order_id=? AND line_index=?",(oid,idx)).fetchone():raise Invalid("Zlecenie dla pozycji już istnieje")
                    c.execute("UPDATE dtf_batches SET available=available-? WHERE id=?",(count,bid))
                    cur=c.execute("INSERT INTO production_tasks(order_id,line_index,batch_id,design,status,created,updated) VALUES(?,?,?,?,?,?,?)",(oid,idx,bid,b["design"],"oczekuje",stamp(),stamp()))
                    audit(c,"production",cur.lastrowid,f"Rezerwacja {count} transferów, zlecenie {oid}, poz. {idx+1}")
                    return self.respond(201,{"id":cur.lastrowid})
            return self.respond(404,{"error":"Nie znaleziono"})
        except (auth.AuthError,ops.OpsError,sales.SalesError,payments.PaymentError,returns.ReturnError,pages.PageError) as ex:return self.respond(ex.status,{'error':str(ex),'code':ex.code})
        except (Invalid,ValueError,TypeError,KeyError,sqlite3.IntegrityError) as ex:
            return self.error(ex)
        except sqlite3.Error:return self.respond(500,{"error":"Błąd zapisu danych"})

    def do_PATCH(self):
        path=urlparse(self.path).path
        if not self.access(path):return
        try:
            with connect() as c:
                if auth.dispatch(self,path,c):return
                if auth.staff_dispatch(self,path,c):return
            data=self.body()
            operation_route=re.fullmatch(r'/api/admin/fulfillment/([1-9][0-9]*)',path)
            if operation_route:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    result=ops.update_line(c,int(operation_route.group(1)),data,self.request_user['id'])
                    mail.enqueue_order(c,result['id'],'order_status_changed')
                return self.respond(200,result)
            if path=='/api/admin/home':
                try:
                    with connect() as c:
                        c.execute('BEGIN IMMEDIATE')
                        cms.save_draft(c,data.get('config'),data.get('revision'))
                        audit(c,'homepage','draft','Zapisano szkic strony głównej')
                        result=cms.get(c,admin=True)
                    return self.respond(200,result)
                except RuntimeError as ex:return self.respond(409,{'error':str(ex)})
            if path=='/api/admin/launch':
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    changed=launch.update(c,data)
                    audit(c,'launch','settings','Zmieniono konfigurację uruchomienia: '+','.join(changed.keys()))
                    result=launch.snapshot(c,readiness=readiness(c))
                    c.commit()
                    return self.respond(200,result)
            page_route=re.fullmatch(r'/api/admin/pages/([a-z0-9-]{1,60})',path)
            if page_route:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    result=pages.save_draft(c,page_route.group(1),data)
                    audit(c,'pages',page_route.group(1),f"Administrator {self.request_user['id']}: zapisano szkic strony {page_route.group(1)}")
                return self.respond(200,result)
            return_route=re.fullmatch(r'/api/admin/returns/([1-9][0-9]*)',path)
            if return_route:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    result=returns.resolve(c,int(return_route.group(1)),data,self.request_user['id'],payments,lambda conn:ops.open_shift(conn,'Kasa 1'))
                    mail.enqueue_order(c,result['order_id'],'return_update',f"{result['id']}:{result['status']}")
                return self.respond(200,result)
            if path=='/api/admin/settings':
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    changed=sales.update_settings(c,data)
                    audit(c,'settings','store',f"Administrator {self.request_user['id']}: zmieniono ustawienia sprzedaży: "+','.join(changed))
                    result={'settings':sales.settings(c),'readiness':readiness(c)}
                return self.respond(200,result)
            shipping_route=re.fullmatch(r'/api/admin/shipping/([1-9][0-9]*)',path)
            if shipping_route:
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    method=sales.save_shipping(c,data,int(shipping_route.group(1)))
                    audit(c,'settings','shipping',f"Zmieniono metodę dostawy {method['code']}")
                return self.respond(200,method)
            gallery_route=re.fullmatch(r'/api/admin/products/([1-9][0-9]*)/gallery',path)
            if gallery_route:
                pid=int(gallery_route.group(1))
                try:
                    with connect() as c:
                        c.execute('BEGIN IMMEDIATE')
                        result=media.save(c,pid,data)
                        audit(c,'product-gallery',pid,f"Zapisano galerię: wersja {result['revision']}, zdjęcia: {len(result['images'])}")
                    return self.respond(200,result)
                except LookupError as ex:return self.respond(404,{'error':str(ex)})
                except media.Conflict as ex:return self.respond(409,{'error':str(ex)})
            if path.startswith('/api/admin/products/'):
                pid=int(path.rsplit('/',1)[1])
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    row=c.execute('SELECT * FROM products WHERE id=?',(pid,)).fetchone()
                    if not row:return self.respond(404,{'error':'Produkt nie istnieje'})
                    product=personalization.validate_product(data,{**dict(row),**personalization.product_options(c,pid)})
                    c.execute('UPDATE products SET name=?,price=? WHERE id=?',(product['name'],product['price'],pid))
                    personalization.save_options(c,pid,product)
                    if pricing.record(c,pid,product['price'],self.request_user['id']):
                        audit(c,'product',pid,f"Zmieniono cenę z {row['price']/100:.2f} na {product['price']/100:.2f} PLN")
                    audit(c,'product',pid,'Zmieniono dane produktu i opcje nadruku')
                    result=next(p for p in catalog(c) if p['id']==pid)
                    c.commit()
                    return self.respond(200,result)
            if path.startswith('/api/admin/players/'):
                pid=int(path.rsplit('/',1)[1])
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    row=c.execute('SELECT * FROM players WHERE id=?',(pid,)).fetchone()
                    if not row:return self.respond(404,{'error':'Zawodnik nie istnieje'})
                    player=personalization.player_value(data,{**dict(row),'active':bool(row['active'])})
                    c.execute('UPDATE players SET name=?,print_name=?,number=?,active=? WHERE id=?',
                              (*tuple(player[key] for key in ('name','print_name','number','active')),pid))
                    audit(c,'player',pid,'Zmieniono dane zawodnika na liście nadruków')
                    result=personalization.player_public(c.execute('SELECT * FROM players WHERE id=?',(pid,)).fetchone(),True)
                    c.commit()
                    return self.respond(200,result)
            if path.startswith('/api/admin/customers/'):
                uid=int(path.rsplit('/',1)[1]);active=data.get('active')
                if not isinstance(active,bool):raise Invalid('Podaj status konta')
                with connect() as c:
                    if not c.execute("SELECT 1 FROM users WHERE id=? AND role='customer'",(uid,)).fetchone():return self.respond(404,{'error':'Klient nie istnieje'})
                    c.execute('UPDATE users SET active=? WHERE id=?',(int(active),uid))
                    if not active:c.execute('DELETE FROM auth_sessions WHERE user_id=?',(uid,))
                    audit(c,'customer',uid,'Aktywowano konto' if active else 'Zablokowano konto')
                    c.commit()
                    return self.respond(200,{'ok':True})
            if path.startswith("/api/admin/orders/"):
                oid=int(path.rsplit("/",1)[1]);status=data.get("status")
                if status not in VALID_STATUS:raise Invalid("Nieprawidłowy status")
                with connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    old=c.execute("SELECT * FROM orders WHERE id=?",(oid,)).fetchone()
                    if not old:raise Invalid("Nie istnieje takie zamówienie")
                    if old["status"] in sales.CLOSED and old["status"]!=status:raise Invalid("Zamówienie zostało już zamknięte")
                    if old['status']!=status and status in WORKFLOW_STATUS:
                        raise Invalid('Ten status nadają dedykowane kroki: Realizacja (pakowanie, wydanie), Płatności (opłacone), Wysyłka lub Zwroty')
                    if old['status']=='oczekuje_platnosci' and status not in ('anulowane','potwierdzone'):
                        raise Invalid('Zamówienie czeka na płatność — potwierdź wpłatę w sekcji płatności')
                    if status=="anulowane" and old["status"]!="anulowane":
                        detail=sales.details(c,oid)
                        if detail and detail['payment_status']=='paid':
                            sales.mark_payment(c,oid,'paid','Anulowano opłacone zamówienie — wymaga zwrotu wpłaty')
                            audit(c,'payment',oid,'Anulowano opłacone zamówienie: zleć zwrot w sekcji płatności')
                        if c.execute('SELECT 1 FROM fulfillment_lines WHERE order_id=? AND printed_qty>0',(oid,)).fetchone():raise Invalid('Nadruk wykonany — anulowanie wymaga obsługi ręcznej')
                        if c.execute("SELECT 1 FROM production_tasks WHERE order_id=? AND status NOT IN ('oczekuje')",(oid,)).fetchone():raise Invalid("Produkcja rozpoczęta — anulowanie wymaga obsługi ręcznej")
                        if c.execute("SELECT 1 FROM production_tasks WHERE order_id=?",(oid,)).fetchone():raise Invalid("Usuń lub rozlicz rezerwacje DTF przed anulowaniem")
                        for line in json.loads(old["items"]):
                            sku=line.get("variant_sku") or line.get("sku","")+"-"+(line.get("size") or "UNI")
                            v=c.execute("SELECT * FROM product_variants WHERE sku=?",(sku,)).fetchone()
                            if v:
                                qty=int(line.get("qty",1))
                                c.execute("UPDATE product_variants SET stock=stock+? WHERE id=?",(qty,v["id"]))
                                c.execute("UPDATE products SET stock=stock+? WHERE id=?",(qty,v["product_id"]))
                                c.execute("INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)",(v["id"],qty,"zwrot rezerwacji po anulowaniu",stamp(),"orders"))
                    if old["status"]!=status:
                        c.execute("UPDATE orders SET status=? WHERE id=?",(status,oid))
                        c.execute("INSERT INTO events(order_id,created,status) VALUES(?,?,?)",(oid,stamp(),status))
                        audit(c,"order",oid,"Status: "+status)
                        mail.enqueue_order(c,oid,'order_status_changed')
                return self.respond(200,{"ok":True,"status":status})
            if path.startswith("/api/admin/inventory/"):
                vid=int(path.rsplit("/",1)[1]);delta=int(data.get("delta",0));reason=str(data.get("reason","")).strip()
                if not delta or abs(delta)>5000 or len(reason)<3 or len(reason)>150:raise Invalid("Podaj zmianę i powód korekty")
                with connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    v=c.execute("SELECT * FROM product_variants WHERE id=?",(vid,)).fetchone()
                    if not v or v["stock"]+delta<0:raise Invalid("Nieprawidłowy stan końcowy")
                    c.execute("UPDATE product_variants SET stock=stock+? WHERE id=?",(delta,vid))
                    c.execute("UPDATE products SET stock=stock+? WHERE id=?",(delta,v["product_id"]))
                    c.execute("INSERT INTO stock_events(variant_id,delta,reason,created,source) VALUES(?,?,?,?,?)",(vid,delta,reason,stamp(),"admin"))
                    audit(c,"stock",vid,f"{delta:+} szt. ({reason})")
                return self.respond(200,{"ok":True})
            if path.startswith("/api/admin/transfers/") and path.endswith("/receive"):
                tid=int(path.split("/")[-2]);qty=int(data.get("quantity",0))
                if qty<1 or qty>100000:raise Invalid("Nieprawidłowa ilość")
                with connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    row=c.execute("SELECT * FROM dtf_batches WHERE id=?",(tid,)).fetchone()
                    if not row or row["received"]+qty>row["ordered"]:raise Invalid("Przyjęcie przekracza ilość zamówioną")
                    c.execute("UPDATE dtf_batches SET received=received+?,available=available+? WHERE id=?",(qty,qty,tid))
                    audit(c,"transfer",tid,f"Przyjęto {qty} szt. transferów od dostawcy")
                return self.respond(200,{"ok":True})
            if path.startswith("/api/admin/production/"):
                tid=int(path.rsplit("/",1)[1]);status=data.get("status")
                if status not in PRINT_STATUS:raise Invalid("Nieprawidłowy etap produkcji")
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    old=c.execute("SELECT * FROM production_tasks WHERE id=?",(tid,)).fetchone()
                    if not old:raise Invalid("Nie znaleziono zlecenia")
                    parent=c.execute('SELECT status FROM orders WHERE id=?',(old['order_id'],)).fetchone()
                    if not parent or parent['status'] in ('anulowane','wyslane_demo','wydane','spakowane'):raise Invalid('Zamówienie nie jest aktywne')
                    if old["status"] in ("gotowe","odrzucone") and status!=old["status"]:raise Invalid("Zlecenie zakończone")
                    if old["status"]!=status:
                        c.execute("UPDATE production_tasks SET status=?,updated=? WHERE id=?",(status,stamp(),tid))
                        audit(c,"production",tid,"Etap: "+status)
                return self.respond(200,{"ok":True})
            return self.respond(404,{"error":"Nie znaleziono"})
        except (auth.AuthError,ops.OpsError,sales.SalesError,payments.PaymentError,returns.ReturnError,pages.PageError) as ex:return self.respond(ex.status,{'error':str(ex),'code':ex.code})
        except (Invalid,ValueError,TypeError,KeyError) as ex:return self.error(ex)
        except sqlite3.Error:return self.respond(500,{"error":"Błąd zapisu danych"})

if __name__=="__main__":
    if not TOKEN:
        raise SystemExit("ZASTAL_ADMIN_TOKEN required")
    init()
    host=os.environ.get("ZASTAL_HOST","127.0.0.1")
    port=int(os.environ.get("ZASTAL_PORT","8880"))
    print(f"Zastal Store demo API listening on {host}:{port}",flush=True)
    ThreadingHTTPServer((host,port),Handler).serve_forever()
