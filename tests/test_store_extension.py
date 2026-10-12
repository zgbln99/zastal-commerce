"""Real HTTP boundaries for the combined prelaunch account and staff release."""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
import commerce_api as api
import commerce_auth as auth
import commerce_email as mail
from http_client import Client

class StoreExtensionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_before,cls.token_before=api.DATABASE,api.TOKEN
        cls.env_before=os.environ.pop('ZASTAL_TEST_MODE',None)
        cls.server=api.ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
        cls.port=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
        api.DATABASE,api.TOKEN=cls.db_before,cls.token_before
        if cls.env_before is not None:os.environ['ZASTAL_TEST_MODE']=cls.env_before

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        api.DATABASE=Path(self.tmp.name)/'combined.sqlite3';api.TOKEN='isolated-test-administrator'
        auth.clear_limits();api.init()
        with api.connect() as c:
            c.execute("INSERT INTO products VALUES(1,'Test shirt','TEST-TS','Koszulki',7900,4)")
            c.execute('INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(?,?,?,?,?)',(1,'M','TEST-TS-M',api.ean13(101),4))
        self.admin=Client(self.port);self.assertEqual(self.admin.login('admin',api.TOKEN)[0],200)

    def tearDown(self):self.tmp.cleanup()

    def sale(self,quantity=2):
        return {'items':[{'id':1,'size':'M','quantity':quantity,'unit_price':1}],
                'idempotency_key':'http-combined-sale-0001','payment_method':'cash','payment_confirmed':True}

    def test_staff_endpoints_keep_role_and_csrf_boundaries(self):
        guest=Client(self.port)
        for method,path,body in [('GET','/api/admin/fulfillment',None),('GET','/api/admin/email',None),('POST','/api/admin/pos/sales',self.sale())]:
            self.assertEqual(guest.request(method,path,body)[0],401)
        customer=Client(self.port);self.assertEqual(customer.register()[0],201)
        for method,path,body in [('GET','/api/admin/fulfillment',None),('GET','/api/admin/email',None),('POST','/api/admin/pos/sales',self.sale())]:
            self.assertEqual(customer.request(method,path,body)[0],403)
        self.assertEqual(self.admin.request('POST','/api/admin/pos/sales',self.sale(),csrf=False)[0],403)
        with api.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM orders').fetchone()[0],0)

    def test_pos_retry_stock_and_fulfillment_cannot_be_bypassed(self):
        code,sale=self.admin.request('POST','/api/admin/pos/sales',self.sale())
        self.assertEqual(code,201,sale);self.assertEqual(sale['total'],15800)
        oid=sale['id']
        code,replay=self.admin.request('POST','/api/admin/pos/sales',self.sale())
        self.assertEqual(code,200);self.assertEqual(replay['id'],oid)
        self.assertEqual(self.admin.request('POST','/api/admin/pos/sales',self.sale(1))[0],409)
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT stock FROM product_variants').fetchone()[0],2)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM orders').fetchone()[0],1)
        path='/api/admin/fulfillment/'+str(oid)
        self.assertEqual(self.admin.request('POST',path+'/complete',{'revision':0,'action':'pack'})[0],409)
        self.assertEqual(self.admin.request('PATCH','/api/admin/orders/'+str(oid),{'status':'spakowane'})[0],400)
        revision=0
        for action in ['pick','pick','check','check']:
            code,detail=self.admin.request('PATCH',path,{'revision':revision,'line_index':0,'action':action,'quantity':1,'code':'TEST-TS-M'})
            self.assertEqual(code,200,detail);revision=detail['revision']
        self.assertEqual(self.admin.request('PATCH',path,{'revision':0,'line_index':0,'action':'pick','quantity':1})[0],409)
        code,detail=self.admin.request('POST',path+'/complete',{'revision':revision,'action':'pack'})
        self.assertEqual(code,200,detail);self.assertEqual(detail['status'],'spakowane')
        code,detail=self.admin.request('POST',path+'/complete',{'revision':detail['revision'],'action':'handover'})
        self.assertEqual(code,200,detail);self.assertEqual(detail['status'],'wydane')
        self.assertEqual(self.admin.request('PATCH','/api/admin/orders/'+str(oid),{'status':'nowe'})[0],400)
        self.assertEqual(self.admin.request('GET','/api/admin/fulfillment')[1],[])

    def test_email_reset_is_single_use_and_revokes_cookie(self):
        customer=Client(self.port);code,registered=customer.register()
        self.assertEqual(code,201,registered)
        guest=Client(self.port);guest.session()
        for address in ['missing@example.test','customer@example.test']:
            self.assertEqual(guest.request('POST','/api/auth/password-reset/request',{'email':address}),(200,{'ok':True}))
        with api.connect() as c:
            user=c.execute('SELECT * FROM users WHERE id=?',(registered['user']['id'],)).fetchone()
            token=mail._issue_token(c,user,'password_reset')
        code,result=guest.request('POST','/api/auth/password-reset/confirm',{'token':token,'password':'New strong password 2026'})
        self.assertEqual(code,200,result)
        self.assertEqual(customer.request('GET','/api/account/orders')[0],401)
        self.assertEqual(guest.request('POST','/api/auth/password-reset/confirm',{'token':token,'password':'Another strong password'})[0],400)
        self.assertEqual(guest.login('customer@example.test','New strong password 2026')[0],200)
        self.assertEqual(guest.request('POST','/api/orders',{'items':[{'id':1,'size':'M','quantity':1}]})[0],503)

    def test_untracked_historical_orders_cannot_bypass_saved_fulfillment(self):
        items=json.dumps([{'sku':'TEST-TS','variant_sku':'TEST-TS-M','size':'M','qty':1,'unit_price':7900}])
        with api.connect() as c:
            active=c.execute('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',(api.stamp(),items,7900,'do_kompletacji')).lastrowid
            packed=c.execute('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',(api.stamp(),items,7900,'spakowane')).lastrowid
        for status in ['spakowane','wyslane_demo','wydane']:
            self.assertEqual(self.admin.request('PATCH',f'/api/admin/orders/{active}',{'status':status})[0],400)
        self.assertEqual(self.admin.request('PATCH',f'/api/admin/orders/{packed}',{'status':'spakowane'})[0],200)
        code,detail=self.admin.request('GET',f'/api/admin/fulfillment/{packed}')
        self.assertEqual(code,200);self.assertFalse(detail['ready_to_handover'])
        self.assertEqual(self.admin.request('POST',f'/api/admin/fulfillment/{packed}/complete',{'revision':0,'action':'handover'})[0],409)
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM fulfillment_revisions').fetchone()[0],0)
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?',(active,)).fetchone()[0],'do_kompletacji')
            self.assertEqual(c.execute('SELECT status FROM orders WHERE id=?',(packed,)).fetchone()[0],'spakowane')

    def test_pos_customer_association_reaches_only_own_history_and_email_queue(self):
        customer=Client(self.port);code,registered=customer.register()
        self.assertEqual(code,201);uid=registered['user']['id']
        other=Client(self.port);self.assertEqual(other.register('other@example.test')[0],201)
        payload={**self.sale(),'customer_id':uid}
        code,sale=self.admin.request('POST','/api/admin/pos/sales',payload)
        self.assertEqual(code,201,sale)
        code,history=customer.request('GET','/api/account/orders')
        self.assertEqual(code,200);self.assertIn(sale['id'],[row['id'] for row in history])
        self.assertEqual(other.request('GET','/api/account/orders')[1],[])
        self.assertEqual(self.admin.request('POST','/api/admin/pos/sales',payload)[0],200)
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT customer_id FROM order_receipts WHERE order_id=?',(sale['id'],)).fetchone()[0],uid)
            rows=c.execute("SELECT user_id,status FROM email_outbox WHERE order_id=? AND kind='order_created'",(sale['id'],)).fetchall()
            self.assertEqual([(row['user_id'],row['status']) for row in rows],[(uid,'pending')])

    def test_historical_packed_order_still_requires_finished_production(self):
        items=json.dumps([{'sku':'TEST-TS','variant_sku':'TEST-TS-M','size':'M','qty':1,'unit_price':7900}])
        with api.connect() as c:
            oid=c.execute('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',(api.stamp(),items,7900,'spakowane')).lastrowid
            c.execute('INSERT INTO fulfillment_lines VALUES(?,?,?,?,?)',(oid,0,1,1,1))
            batch=c.execute('SELECT id FROM dtf_batches LIMIT 1').fetchone()[0]
            c.execute('INSERT INTO production_tasks(order_id,line_index,batch_id,design,status,created,updated) VALUES(?,?,?,?,?,?,?)',(oid,0,batch,'Historical print','oczekuje',api.stamp(),api.stamp()))
        path=f'/api/admin/fulfillment/{oid}'
        self.assertFalse(self.admin.request('GET',path)[1]['ready_to_handover'])
        self.assertEqual(self.admin.request('POST',path+'/complete',{'revision':0,'action':'handover'})[0],409)
        with api.connect() as c:c.execute("UPDATE production_tasks SET status='gotowe' WHERE order_id=?",(oid,))
        self.assertTrue(self.admin.request('GET',path)[1]['ready_to_handover'])
        self.assertEqual(self.admin.request('POST',path+'/complete',{'revision':0,'action':'handover'})[0],200)

if __name__=='__main__':unittest.main()
