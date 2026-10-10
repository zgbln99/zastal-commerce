"""Isolated checkout and receipt integration tests; never touch server data."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
import commerce_api as api

class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        api.DATABASE=Path(self.folder.name)/'checkout.sqlite3'
        api.TOKEN='test-only-admin'
        api.LIMITS.clear()
        api.auth.clear_limits()
        api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products VALUES(1,'Koszulka','TS','Koszulki',7900,15)")
            c.execute("INSERT INTO products VALUES(2,'Akcesorium','AC','Akcesoria',15000,10)")
        api.init()
        self.server=api.ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
        threading.Thread(target=lambda:self.server.serve_forever(poll_interval=.02),daemon=True).start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.folder.cleanup()
    def request(self,method,path,data=None):
        req=urllib.request.Request('http://127.0.0.1:'+str(self.server.server_address[1])+path,method=method,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as r:return r.code,json.load(r)
    def payload(self,**extra):
        return {'items':[{'id':1,'size':'L','quantity':1}],'fulfillment':'odbior','idempotency_key':'checkout-test-key-123456',**extra}
    def test_retry_does_not_duplicate_order_or_deduct_stock_twice(self):
        code,first=self.request('POST','/api/orders',self.payload())
        self.assertEqual(code,201)
        code,second=self.request('POST','/api/orders',self.payload())
        self.assertEqual(code,200)
        self.assertEqual(first,second)
        _,p=self.request('GET','/api/catalog/1')
        self.assertEqual(next(v['stock'] for v in p['variants'] if v['size']=='L'),2)
    def test_reusing_key_with_different_cart_is_rejected(self):
        self.request('POST','/api/orders',self.payload())
        code,_=self.request('POST','/api/orders',self.payload(items=[{'id':1,'size':'M','quantity':1}]))
        self.assertEqual(code,409)
    def test_receipt_is_protected_and_includes_shipping_and_history(self):
        _,o=self.request('POST','/api/orders',self.payload(fulfillment='paczkomat'))
        self.assertIn('tracking_token',o)
        for suffix in ['', '?token=incorrect']:
            code,_=self.request('GET','/api/orders/'+str(o['id'])+suffix)
            self.assertEqual(code,404)
        code,receipt=self.request('GET','/api/orders/'+str(o['id'])+'?token='+o['tracking_token'])
        self.assertEqual(code,200)
        self.assertEqual(receipt['shipping_fee'],1299)
        self.assertEqual(receipt['subtotal'],7900)
        self.assertEqual(receipt['items'][0]['size'],'L')
        self.assertEqual(receipt['events'][0]['status'],'nowe')
        self.assertNotIn('idempotency_key',receipt)
    def test_prices_and_shipping_are_computed_on_server(self):
        code,o=self.request('POST','/api/orders',self.payload(fulfillment='kurier',total=1,shipping_fee=0,items=[{'id':1,'size':'L','quantity':1,'unit_price':1}]))
        self.assertEqual(code,201)
        self.assertEqual(o['total'],9399)
        code,o=self.request('POST','/api/orders',self.payload(idempotency_key='another-checkout-key-123456',fulfillment='kurier',items=[{'id':2,'size':'UNI','quantity':2}]))
        self.assertEqual(o['total'],30000)
    def test_bad_delivery_and_partial_unavailable_cart_do_not_reduce_stock(self):
        code,_=self.request('POST','/api/orders',self.payload(fulfillment='invalid'))
        self.assertEqual(code,400)
        code,_=self.request('POST','/api/orders',self.payload(items=[{'id':1,'size':'L','quantity':1},{'id':1,'size':'S','quantity':4}]))
        self.assertEqual(code,400)
        _,p=self.request('GET','/api/catalog/1')
        self.assertEqual(next(v['stock'] for v in p['variants'] if v['size']=='L'),3)
    def test_invalid_idempotency_key_does_not_create_order(self):
        code,_=self.request('POST','/api/orders',self.payload(idempotency_key='short'))
        self.assertEqual(code,400)

if __name__=='__main__':unittest.main()
