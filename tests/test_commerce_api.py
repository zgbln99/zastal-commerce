"""Integration tests for Zastal Commerce OS demo API. Safe isolated DB and local port."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
import commerce_api as api
from http_client import Client

class CommerceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder=tempfile.TemporaryDirectory()
        api.DATABASE=Path(cls.folder.name)/"test.sqlite3"
        api.TOKEN="integration-test-only"
        api.auth.clear_limits()
        api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products(id,name,sku,category,price,stock) VALUES(1,'Koszulka Zastal','DEMO-TS','Koszulki',7900,15)")
        api.init()
        cls.server=api.ThreadingHTTPServer(("127.0.0.1",0),api.Handler)
        cls.port=cls.server.server_address[1]
        cls.admin_client=Client(cls.port)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.folder.cleanup()

    def request(self,method,path,data=None,authorized=False):
        if authorized:
            if not self.admin_client.csrf:
                code,_=self.admin_client.login('admin','integration-test-only')
                self.assertEqual(code,200)
            return self.admin_client.request(method,path,data)
        headers={"Content-Type":"application/json"}
        content=json.dumps(data).encode() if data is not None else None
        req=urllib.request.Request("http://127.0.0.1:"+str(self.port)+path,method=method,data=content,headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=5) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as response:return response.code,json.load(response)

    def test_01_stock_variant_and_order_cancellation(self):
        code,p=self.request("GET","/api/catalog/1")
        self.assertEqual(code,200)
        stock=next(v["stock"] for v in p["variants"] if v["size"]=="L")
        code,o=self.request("POST","/api/orders",{"items":[{"id":1,"size":"L","quantity":2}]})
        self.assertEqual(code,201)
        code,p=self.request("GET","/api/catalog/1")
        self.assertEqual(next(v["stock"] for v in p["variants"] if v["size"]=="L"),stock-2)
        code,detail=self.request("GET","/api/admin/orders/"+str(o["id"]),authorized=True)
        self.assertEqual(code,200)
        self.assertEqual(detail["items"][0]["size"],"L")
        self.assertEqual(detail["items"][0]["variant_sku"],"DEMO-TS-L")
        code,result=self.request("PATCH","/api/admin/orders/"+str(o["id"]),{"status":"anulowane"},authorized=True)
        self.assertEqual(code,200)
        code,p=self.request("GET","/api/catalog/1")
        self.assertEqual(next(v["stock"] for v in p["variants"] if v["size"]=="L"),stock)

    def test_02_dtf_purchase_receipt_and_production(self):
        code,b=self.request("POST","/api/admin/transfers",{"design":"Projekt testowy","supplier":"Drukarnia testowa","reference":"TEST-01","quantity":4,"cost_unit":500},True)
        self.assertEqual(code,201)
        code,_=self.request("PATCH","/api/admin/transfers/"+str(b["id"])+"/receive",{"quantity":3},True)
        self.assertEqual(code,200)
        code,o=self.request("POST","/api/orders",{"items":[{"id":1,"size":"M","quantity":2}]})
        self.assertEqual(code,201)
        code,t=self.request("POST","/api/admin/production",{"order_id":o["id"],"line_index":0,"batch_id":b["id"]},True)
        self.assertEqual(code,201)
        code,batches=self.request("GET","/api/admin/transfers",authorized=True)
        self.assertEqual(next(x["available"] for x in batches if x["id"]==b["id"]),1)
        code,_=self.request("PATCH","/api/admin/production/"+str(t["id"]),{"status":"nanoszenie"},True)
        self.assertEqual(code,200)
        code,detail=self.request("GET","/api/admin/orders/"+str(o["id"]),authorized=True)
        self.assertEqual(detail["production"][0]["status"],"nanoszenie")
        code,result=self.request("PATCH","/api/admin/orders/"+str(o["id"]),{"status":"anulowane"},True)
        self.assertEqual(code,400)

    def test_03_auth_and_audit(self):
        status,_=self.request("GET","/api/admin/inventory")
        self.assertEqual(status,401)
        status,data=self.request("GET","/api/admin/inventory",authorized=True)
        self.assertEqual(status,200)
        self.assertEqual(len(data),5)
        status,_=self.request("PATCH","/api/admin/inventory/"+str(data[0]["id"]),{"delta":3,"reason":"Testowa dostawa"},True)
        self.assertEqual(status,200)
        status,ledger=self.request("GET","/api/admin/stock-events",authorized=True)
        self.assertTrue(any(row["reason"]=="Testowa dostawa" for row in ledger))
        status,audit=self.request("GET","/api/admin/activity",authorized=True)
        self.assertEqual(status,200)
        self.assertGreaterEqual(len(audit),1)

    def test_04_ean13_checksum(self):
        code=api.ean13(102)
        self.assertEqual(len(code),13)
        check=sum(int(v)*(3 if i%2 else 1) for i,v in enumerate(code[:12]))
        self.assertEqual((check+int(code[-1]))%10,0)

if __name__=="__main__":unittest.main()
