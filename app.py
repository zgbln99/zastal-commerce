"""Zastal Store: local-only prototype, Python standard library."""
import datetime
import html
import json
import os
import secrets
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).parent
DB = Path(os.environ.get("ZASTAL_DB", str(ROOT / "zastal.sqlite3")))
TOKEN = os.environ.get("ZASTAL_ADMIN_TOKEN", "")

def connection():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    return db

def init():
    with connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, category TEXT, price INTEGER NOT NULL, stock INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, items TEXT, total INTEGER, status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, created TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS transfers(id INTEGER PRIMARY KEY AUTOINCREMENT, supplier TEXT, design TEXT, purchased INTEGER, available INTEGER, created TEXT);
        """)
        if not db.execute("SELECT 1 FROM products LIMIT 1").fetchone():
            db.executemany("INSERT INTO products(name,sku,category,price,stock) VALUES(?,?,?,?,?)",[
                ("Zastal Classic — koszulka","ZS-TS-001","Koszulki",7900,38),
                ("Zastal Heritage — bluza","ZS-HD-002","Bluzy",16900,19),
                ("Zielona Góra Basketball — koszulka","ZS-TS-003","Koszulki",8900,24),
                ("Zastal — torba","ZS-AC-004","Akcesoria",5900,27),
                ("Zastal 1946 — longsleeve","ZS-LS-005","Heritage",11900,17),
                ("Zastal — czapka","ZS-AC-006","Akcesoria",6900,35)
            ])

PAGE = """<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zastal Store — demo</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f6f7f4;color:#122219;font:16px system-ui}header{background:#073e2a;color:white;padding:20px 5%;display:flex;justify-content:space-between}header a{color:white}main{max-width:1250px;margin:auto;padding:26px}.hero{background:#0d5a3d;color:white;padding:75px 7%}.hero h1{font-size:clamp(38px,7vw,85px);line-height:.99;letter-spacing:-3px;margin:8px 0}.hero p{max-width:530px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}.item{background:white;padding:16px;border:1px solid #e2e7e1}.art{height:210px;background:linear-gradient(135deg,#d9e7d9,#a9c8ad);display:grid;place-items:center;color:#0c5a3a;font-weight:900;font-size:28px;letter-spacing:-1px}.tag{color:#647d6d;text-transform:uppercase;letter-spacing:2px;font-size:11px}button{background:#086b47;color:white;border:0;padding:12px 18px;cursor:pointer}button:hover{background:#04482e}.box{background:white;border:1px solid #e2e7e1;padding:20px;margin:16px 0}input,select{padding:10px;border:1px solid #ddd}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;border-bottom:1px solid #eee;text-align:left}footer{text-align:center;padding:40px;color:#718478}</style>
<header><strong>ZASTAL / STORE</strong><nav><a href="#catalog">Kolekcja</a> &nbsp; <a href="#cartarea">Koszyk (<span id="count">0</span>)</a> &nbsp; <a href="/admin">Panel</a></nav></header>
<main><section class="hero"><p>KOLEKCJA 2026/27 • PROJEKT DEMONSTRACYJNY</p><h1>ZIELONA GÓRA.<br>NASZA TOŻSAMOŚĆ.</h1><p>Nowe podejście do klubowej odzieży. Zamówienia i płatności są wyłącznie testowe.</p></section><h2>Odkryj kolekcję</h2><section class="grid" id="catalog"></section><section id="cartarea"><h2>Twój koszyk</h2><div class="box" id="cart"></div></section></main>
<footer>Zastal Store — demonstracja. Zdjęcia, ceny i dostępność są poglądowe.</footer>
<script>
let cart=JSON.parse(localStorage.getItem('zastal_demo_cart')||'{}');let products=[];
const money=n=>(n/100).toFixed(2).replace('.',',')+' zł';
async function req(path,opt={}){const r=await fetch('/api'+path,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const data=await r.json();if(!r.ok)throw Error(data.error||'Błąd');return data}
function save(){localStorage.setItem('zastal_demo_cart',JSON.stringify(cart));document.getElementById('count').textContent=Object.values(cart).reduce((a,b)=>a+b,0)}
function add(id){cart[id]=(cart[id]||0)+1;save();renderCart()}
function renderCart(){document.getElementById('cart').innerHTML=Object.entries(cart).map(([id,n])=>{let p=products.find(p=>p.id==id);return p?'<p>'+p.name+' × '+n+' — '+money(p.price*n)+'</p>':''}).join('')+'<button onclick="checkout()">Złóż zamówienie testowe</button>'}
async function checkout(){try{const order=await req('/orders',{method:'POST',body:JSON.stringify({items:Object.entries(cart).map(([id,quantity])=>({id:Number(id),quantity}))})});cart={};save();renderCart();alert('Przyjęto zamówienie testowe #'+order.id)}catch(e){alert(e.message)}}
async function start(){products=await req('/products');document.getElementById('catalog').innerHTML=products.map(p=>'<article class="item"><div class="art">ZASTAL<br>1946</div><p class="tag">'+p.category+'</p><h3>'+p.name+'</h3><p>'+money(p.price)+' · '+p.stock+' szt.</p><button onclick="add('+p.id+')">Dodaj do koszyka</button></article>').join('');save();renderCart()}start();
</script></html>"""
ADMIN = """<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zastal Admin</title><style>body{font:15px system-ui;background:#f6f7f4;margin:35px;color:#163526}button{background:#096b47;color:white;border:0;padding:10px;cursor:pointer}input,select{padding:10px}td,th{padding:12px;border-bottom:1px solid #ddd}table{border-collapse:collapse;width:100%;background:white}</style><h1>Zastal / Centrum operacyjne</h1><p>Panel demonstracyjny dostępny wyłącznie z kluczem administratora.</p><input type="password" id="key" placeholder="Klucz administratora"><button onclick="load()">Otwórz</button><p id="msg"></p><h2>Zamówienia</h2><div id="orders"></div><h2>Magazyn</h2><div id="stock"></div>
<script>
let key='';async function req(path,opt={}){let r=await fetch('/api'+path,{...opt,headers:{'Content-Type':'application/json','Authorization':'Bearer '+key}});let j=await r.json();if(!r.ok)throw Error(j.error);return j}
async function load(){key=document.getElementById('key').value;try{let orders=await req('/admin/orders'),products=await req('/products');document.getElementById('msg').textContent='Połączono';document.getElementById('orders').innerHTML='<table><tr><th>ID</th><th>Kwota</th><th>Status</th></tr>'+orders.map(o=>'<tr><td>'+o.id+'</td><td>'+(o.total/100).toFixed(2)+' zł</td><td><select onchange="change('+o.id+',this.value)">'+['nowe','potwierdzone','do_kompletacji','nanoszenie_dtf','kontrola_jakosci','spakowane','wyslane_demo','anulowane'].map(s=>'<option '+(s==o.status?'selected':'')+'>'+s+'</option>').join('')+'</select></td></tr>').join('')+'</table>';document.getElementById('stock').innerHTML='<table><tr><th>SKU</th><th>Produkt</th><th>Stan</th></tr>'+products.map(p=>'<tr><td>'+p.sku+'</td><td>'+p.name+'</td><td>'+p.stock+'</td></tr>').join('')+'</table>'}catch(e){document.getElementById('msg').textContent=e.message}}
async function change(id,status){try{await req('/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({status})})}catch(e){alert(e.message)}}
</script></html>"""
class Handler(BaseHTTPRequestHandler):
    def respond(self, status, value, mime="application/json"):
        if not isinstance(value,(str,bytes)):value=json.dumps(value,ensure_ascii=False)
        if isinstance(value,str):value=value.encode()
        self.send_response(status)
        self.send_header("Content-Type",mime+"; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.end_headers()
        self.wfile.write(value)
    def authorized(self):
        provided=self.headers.get("Authorization","").removeprefix("Bearer ")
        return bool(TOKEN) and secrets.compare_digest(provided,TOKEN)
    def payload(self):
        try:
            length=int(self.headers.get("Content-Length","0"))
            if not 0<=length<=16000:raise ValueError()
            return json.loads(self.rfile.read(length))
        except (ValueError,json.JSONDecodeError):return {}
    def do_GET(self):
        route=urlparse(self.path).path
        if route=="/":return self.respond(200,PAGE,"text/html")
        if route=="/admin":return self.respond(200,ADMIN,"text/html")
        if route=="/health":return self.respond(200,{"ok":True,"demo":True})
        if route=="/api/products":
            with connection() as c:rows=[dict(x) for x in c.execute("SELECT * FROM products")]
            return self.respond(200,rows)
        if route=="/api/admin/orders":
            if not self.authorized():return self.respond(403,{"error":"Brak uprawnień"})
            with connection() as c:rows=[dict(x) for x in c.execute("SELECT * FROM orders ORDER BY id DESC")]
            return self.respond(200,rows)
        return self.respond(404,{"error":"Nie znaleziono"})
    def do_POST(self):
        if urlparse(self.path).path!="/api/orders":return self.respond(404,{"error":"Nie znaleziono"})
        items=self.payload().get("items",[])
        if not isinstance(items,list) or not 1<=len(items)<=20:return self.respond(400,{"error":"Pusty lub błędny koszyk"})
        with connection() as c:
            try:
                c.execute("BEGIN IMMEDIATE")
                details=[];total=0
                for item in items:
                    identifier=int(item["id"]);quantity=int(item["quantity"])
                    if not 1<=quantity<=20:raise ValueError("Nieprawidłowa ilość")
                    product=c.execute("SELECT * FROM products WHERE id=?",(identifier,)).fetchone()
                    if product is None or product["stock"]<quantity:raise ValueError("Brak wystarczającego stanu")
                    c.execute("UPDATE products SET stock=stock-? WHERE id=?",(quantity,identifier))
                    details.append({"sku":product["sku"],"qty":quantity,"unit_price":product["price"]})
                    total+=quantity*product["price"]
                now=datetime.datetime.now(datetime.timezone.utc).isoformat()
                cur=c.execute("INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)",(now,json.dumps(details),total,"nowe"))
                c.execute("INSERT INTO events(order_id,created,status) VALUES(?,?,?)",(cur.lastrowid,now,"nowe"))
                return self.respond(201,{"id":cur.lastrowid,"total":total})
            except (ValueError,TypeError,KeyError,sqlite3.Error) as ex:
                c.rollback()
                return self.respond(400,{"error":str(ex)})
    def do_PATCH(self):
        route=urlparse(self.path).path
        if not route.startswith("/api/admin/orders/") or not self.authorized():return self.respond(403,{"error":"Brak uprawnień"})
        allowed={"nowe","potwierdzone","do_kompletacji","nanoszenie_dtf","kontrola_jakosci","spakowane","wyslane_demo","anulowane"}
        status=self.payload().get("status")
        if status not in allowed:return self.respond(400,{"error":"Nieprawidłowy status"})
        try:identifier=int(route.rsplit("/",1)[1])
        except ValueError:return self.respond(400,{"error":"Nieprawidłowy identyfikator"})
        with connection() as c:
            if not c.execute("SELECT id FROM orders WHERE id=?",(identifier,)).fetchone():return self.respond(404,{"error":"Brak zamówienia"})
            now=datetime.datetime.now(datetime.timezone.utc).isoformat()
            c.execute("UPDATE orders SET status=? WHERE id=?",(status,identifier))
            c.execute("INSERT INTO events(order_id,created,status) VALUES(?,?,?)",(identifier,now,status))
        return self.respond(200,{"ok":True})
if __name__=="__main__":
    init()
    host=os.environ.get("ZASTAL_HOST","127.0.0.1")
    port=int(os.environ.get("ZASTAL_PORT","8877"))
    print(f"Zastal Store Demo: http://{host}:{port}",flush=True)
    ThreadingHTTPServer((host,port),Handler).serve_forever()
