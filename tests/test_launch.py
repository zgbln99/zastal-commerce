"""Prelaunch controls must fail closed while preserving protected staff actions."""
import os
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
import json
from pathlib import Path
from unittest.mock import patch
import commerce_api as api
import commerce_launch as launch
from http_client import Client

class LaunchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.db_before=api.DATABASE
        cls.token_before=api.TOKEN
        cls.env_before=os.environ.pop("ZASTAL_TEST_MODE",None)
        api.DATABASE=Path(cls.tmp.name)/"launch.sqlite3"
        api.TOKEN="local-isolated-admin-token"
        api.init()
        cls.server=api.ThreadingHTTPServer(("127.0.0.1",0),api.Handler)
        cls.port=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.client=Client(cls.port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()
        api.DATABASE=cls.db_before
        api.TOKEN=cls.token_before
        if cls.env_before is not None:os.environ["ZASTAL_TEST_MODE"]=cls.env_before

    def public(self,method,path,body=None):
        request=urllib.request.Request(
            f"http://127.0.0.1:{self.port}"+path,
            method=method,headers={"Content-Type":"application/json"},
            data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(request,timeout=8) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as r:return r.status,json.load(r)

    def test_01_live_orders_blocked_but_signup_available(self):
        status,st=self.public("GET","/api/store/status")
        self.assertEqual(status,200)
        self.assertEqual(st["phase"],"prelaunch")
        self.assertFalse(st["checkout_enabled"])
        self.assertTrue(st["registration_enabled"])
        status,data=self.public("POST","/api/orders",{"items":[{"id":1,"size":"L","quantity":1}]})
        self.assertEqual(status,503)
        self.assertEqual(data["code"],"store_prelaunch")
        customer=Client(self.port)
        status,registered=customer.register("prelaunch-account@example.test")
        self.assertEqual(status,201,registered)
        self.assertEqual(registered['user']['role'],'customer')
        status,_=customer.request('GET','/api/admin/products')
        self.assertEqual(status,403)
        status,_=customer.request('POST','/api/orders',{'items':[{'id':1,'size':'L','quantity':1}]})
        self.assertEqual(status,503)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM orders").fetchone()[0],0)

    def test_02_readiness_and_audited_settings(self):
        status,_=self.client.login("admin","local-isolated-admin-token")
        self.assertEqual(status,200)
        status,data=self.client.request("GET","/api/admin/launch")
        self.assertEqual(status,200)
        self.assertEqual(len(data["checks"]),10)
        self.assertFalse(data["can_activate"])
        self.assertEqual(data["completed"],0)
        payload={"seller_name":"Klub Sportowy TEST","tax_id":"5261040828","business_address":"Testowa 1, 00-001 Warszawa",
                 "support_email":"kontakt@example.org","support_phone":"+48 601 234 567","brand_approved":True}
        status,updated=self.client.request("PATCH","/api/admin/launch",payload)
        self.assertEqual(status,200)
        self.assertTrue(updated["settings"]["brand_approved"])
        self.assertIn("Dane rejestrowe sprzedawcy i kontakt",[x["label"] for x in updated["checks"] if x["ok"]])
        self.assertFalse(updated["checkout_enabled"])
        status,bad=self.client.request("PATCH","/api/admin/launch",{"tax_id":"1234567890"})
        self.assertEqual(status,400)
        status,bad=self.client.request("PATCH","/api/admin/launch",{"terms_url":"http://no-https.example"})
        self.assertEqual(status,400)
        status,new=self.client.request("GET","/api/admin/launch")
        self.assertEqual(new["settings"]["tax_id"],"5261040828")
        self.assertFalse(new["checks"][-1]["ok"])
        with api.connect() as c:
            self.assertGreater(c.execute("SELECT COUNT(*) FROM launch_changes").fetchone()[0],0)

    def test_capture_only_smtp_does_not_pass_live_email_gate(self):
        values = {'ZASTAL_SMTP_HOST': '127.0.0.1', 'ZASTAL_SMTP_PORT': '1025',
                  'ZASTAL_SMTP_FROM': 'sklep@zastal.test', 'ZASTAL_SMTP_TLS': 'none',
                  'ZASTAL_SITE_ORIGIN': 'https://store.example.test'}
        with patch.dict(os.environ, values):
            with api.connect() as c:
                self.assertFalse(api.readiness(c)['checks']['email'])
        values.update(ZASTAL_SMTP_HOST='smtp.example.test', ZASTAL_SMTP_PORT='587',
                      ZASTAL_SMTP_TLS='starttls')
        with patch.dict(os.environ, values):
            with api.connect() as c:
                self.assertTrue(api.readiness(c)['checks']['email'])

    def test_03_admin_endpoint_not_public(self):
        status,data=self.public("GET","/api/admin/launch")
        self.assertIn(status,(401,403))
        self.assertNotIn("settings",data)

    def test_04_validation(self):
        self.assertTrue(launch.niptax_ok("526-104-08-28"))
        self.assertFalse(launch.niptax_ok("5261040820"))
        self.assertFalse(launch.https_url("http://example.org"))
        self.assertFalse(launch.https_url("https://user:pass@example.org"))
        self.assertTrue(launch.https_url("https://example.org/privacy"))

    def test_05_stocktake_is_atomic_and_audited(self):
        status,_=self.client.login("admin","local-isolated-admin-token")
        self.assertEqual(status,200)
        with api.connect() as c:
            c.execute("INSERT INTO products(id,name,sku,category,price,stock) VALUES(777,'Test stocktake','QA-SKU','Koszulki',7000,12)")
            c.execute("INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(?,?,?,?,?)",
                      (777,'M','QA-SKU-M',api.ean13(77701),5))
            c.execute("INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(?,?,?,?,?)",
                      (777,'L','QA-SKU-L',api.ean13(77702),7))
        code,fail=self.client.request("POST","/api/admin/inventory/import",
             {"rows":[{"sku":"QA-SKU-M","stock":9},{"sku":"MISSING-SKU","stock":0}],"reason":"Spis z natury QA"})
        self.assertEqual(code,400)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM product_variants WHERE sku='QA-SKU-M'").fetchone()[0],5)
        code,out=self.client.request("POST","/api/admin/inventory/import",
             {"rows":[{"sku":"QA-SKU-M","stock":9},{"sku":"QA-SKU-L","stock":0}],"reason":"Spis z natury QA"})
        self.assertEqual(code,200)
        self.assertEqual(out["changed"],2)
        with api.connect() as c:
            self.assertEqual(c.execute("SELECT stock FROM products WHERE id=777").fetchone()[0],9)
            self.assertEqual(c.execute("SELECT COUNT(*) FROM stock_events WHERE source='inventory-import'").fetchone()[0],2)
        code,out=self.client.request("POST","/api/admin/inventory/import",
             {"rows":[{"sku":"QA-SKU-M","stock":1},{"sku":"QA-SKU-M","stock":2}],"reason":"Drugi import"})
        self.assertEqual(code,400)

if __name__=="__main__":unittest.main()
